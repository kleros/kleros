pragma solidity ^0.4.24;

import "./KlerosLiquid.sol";
import "@kleros/kleros-interaction/contracts/libraries/CappedMath.sol";

contract KlerosGovernor is Arbitrable{
    using CappedMath for uint;

    enum Status {NoDispute, DisputeCreated}

    struct Transaction{
        uint ID; 
        address target;
        uint value;
        bytes data;
        bool executed;  
    } 
    struct TransactionList{
        address sender;
        uint deposit;
        mapping(uint => Transaction) transactions;
        bytes32 listHash;
        uint submissionTime;
        mapping(uint => bool) appealFeePaid; 
        uint txCounter; 
    }

    Status public status;
    uint public submissionDeposit;
    uint public withdrawTimeout;
    uint public submissionTimeout; 

    uint public winnerStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that lost the previous round.
    uint public sharedStakeMultiplier; // Multiplier for calculating the fee stake that must be paid in the case where there isn't a winner and loser (e.g. when the arbitrator ruled "refused to rule"/"could not rule").
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.

    uint public sumDeposit; //sum of all submission deposits in a session. Needed for calculating a reward
    uint public lastAction; 

    uint public disputeID;

    uint public round; //0 - dispute, 1-.. appeal rounds
    mapping (uint => uint) public submissions; //ID of a submssion starting with 1 -> index of txList in the array
    mapping(uint => uint) public submissionCounter; //round -> number of submissions 
    TransactionList[] public txLists; 

    modifier depositRequired() {require(msg.value >= submissionDeposit, "Submission deposit must be paid"); _;}
    modifier duringSubmissionPeriod() {require(now <= lastAction + submissionTimeout, "Submission time has ended"); _;}
    modifier duringExecutionPeriod() {require(now > lastAction + submissionTimeout, "Execution time has not started yet"); _;}

    constructor(
        KlerosLiquid _kleros, 
        bytes _extraData, 
        uint _submissionDeposit, 
        uint _submissionTimeout, 
        uint _withdrawTimeout, 
        uint _winnerStakeMultiplier,
        uint _loserStakeMultiplier, 
        uint _sharedStakeMultiplier 
    )public Arbitrable(_kleros, _extraData){
        lastAction = now;
        submissionDeposit = _submissionDeposit;
        submissionTimeout = _submissionTimeout;
        withdrawTimeout = _withdrawTimeout;
        winnerStakeMultiplier = _winnerStakeMultiplier;
        loserStakeMultiplier = _loserStakeMultiplier;
        sharedStakeMultiplier = _sharedStakeMultiplier;
    }

    function createTransactionList() public duringSubmissionPeriod returns(uint listID){ 
        txLists.length++;
        listID = txLists.length - 1;
        TransactionList storage txList = txLists[listID];
        txList.sender = msg.sender;
    }

    function addTransactions(uint _listID, address _target, bytes _data) payable public duringSubmissionPeriod {
        TransactionList storage txList = txLists[_listID];
        require(txList.sender == msg.sender, "Can't add transactions to the list created by someone else");
        require(txList.submissionTime == 0, "List is already submitted");
        txList.txCounter++;
        uint ID = uint(keccak256(abi.encodePacked(_target, msg.value, _data)));
        uint index;
        bool found;
        //transactions are sorted to catch lists with the same transactions that were added in different order
        if (txList.txCounter > 1) {
            for (uint i = txList.txCounter - 2; i >= 0; i--){
                if (ID < txList.transactions[i].ID){
                    Transaction storage currentTx = txList.transactions[i];
                    txList.transactions[i + 1] = currentTx; 
                    delete txList.transactions[i];
                    index = i;
                    found = true;
                } else {
                    break; 
                }             
            }
        }
        if (!found) index = txList.txCounter - 1;
        Transaction storage transaction = txList.transactions[index];
        transaction.ID = ID; 
        transaction.target = _target;
        transaction.value = msg.value;
        transaction.data = _data;
    }    

    function submitTransactionList(uint _listID)payable public depositRequired duringSubmissionPeriod{  
        TransactionList storage txList = txLists[_listID];
        require(txList.sender == msg.sender, "Can't submit the list created by someone else");
        require(txList.submissionTime == 0, "List is already submitted"); 
        txList.submissionTime = now;
        txList.deposit = submissionDeposit;
        //store listhash to catch duplicates
        if (txList.txCounter > 0){
            bytes32 listHash = bytes32(txList.transactions[0].ID); 
            for (uint i = 1; i < txList.txCounter; i++){ 
                listHash = keccak256(abi.encodePacked(bytes32(txList.transactions[i].ID), listHash));
            }
            txList.listHash = listHash; 
        }
        sumDeposit += submissionDeposit;
        submissionCounter[round]++;
        submissions[submissionCounter[round]] = _listID;

        uint surplus = msg.value - submissionDeposit;
        if (surplus > 0) msg.sender.send(surplus);
    }

    function withdrawTransactionList(uint _submissionID) public duringSubmissionPeriod{
        require(_submissionID > 0 && _submissionID <= submissionCounter[0], "ID is out of range");
        TransactionList storage txList = txLists[submissions[_submissionID]];
        require(txList.sender == msg.sender, "Can't withdraw the list created by someone else");
        require(now - txList.submissionTime <= withdrawTimeout, "Withdrawing time has passed");
        uint deposit = txList.deposit;
        submissions[_submissionID] = submissions[submissionCounter[0]];
        delete submissions[submissionCounter[0]];
        submissionCounter[0]--;
        sumDeposit -= deposit;
        require(msg.sender.send(deposit), "Was unable to return deposit");
    }

    function executeTransactionList() public duringExecutionPeriod{
        require(status == Status.NoDispute, "Can't execute transaction list while dispute is active");

        if (submissionCounter[round] == 0){
            lastAction = now;
            return; 
        }

        if (submissionCounter[round] == 1) {
            TransactionList storage txList = txLists[submissions[1]];
            for (uint i = 0; i < txList.txCounter; i++){
                Transaction storage transaction = txList.transactions[i];
                require(!transaction.executed); // solium-disable-line error-reason
                transaction.executed = true; 
                transaction.target.call.value(transaction.value)(transaction.data); // solium-disable-line security/no-call-value
            }
            sumDeposit = 0; 
            lastAction = now;
            submissionCounter[round] = 0;
        } else {
            status = Status.DisputeCreated;
            uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
            disputeID = arbitrator.createDispute.value(arbitrationCost)(txLists.length, arbitratorExtraData);
            sumDeposit = sumDeposit.subCap(arbitrationCost); 
            lastAction = 0; //freeze lastAction time so there would be no submissions untill the dispute is resolved
            round++;
        }
    }

    function fundAppeal(uint _submissionID) public payable{
        require(_submissionID > 0 && _submissionID <= submissionCounter[0], "ID is out of range");
        require(status == Status.DisputeCreated, "No dispute to appeal");
        require(arbitrator.disputeStatus(disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(disputeID);
        require(
            now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart) * 2/3,
            "Appeal fees must be paid within the two thirds of appeal period."
        ); 
        TransactionList storage txList = txLists[submissions[_submissionID]];
        require(txList.sender == msg.sender, "Can't fund the list created by someone else");

        if (round > 1){
            require(txList.appealFeePaid[round - 1], "Can't participate if didn't pay appeal fee in previous round");
        }

        require(!txList.appealFeePaid[round], "Appeal fee has already been paid");

        bool winner;
        uint multiplier; 

        if (arbitrator.currentRuling(disputeID) == _submissionID){
            winner = true;
            multiplier = winnerStakeMultiplier;
        } else if (arbitrator.currentRuling(disputeID) == 0){
            multiplier = sharedStakeMultiplier;
        } else {
            multiplier = loserStakeMultiplier;
        }

        require(winner || (now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart)/3), "The loser must pay during the first third of the appeal period.");

        uint appealCost = arbitrator.appealCost(disputeID, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);

        require(msg.value >= totalCost, "Not enough ETH to cover appeal cost");
        txList.appealFeePaid[round] = true; 
        submissionCounter[round]++;
        uint remainder = msg.value - totalCost;
        if (remainder > 0) require(txList.sender.send(remainder), "Couldn't sent leftover ETH");

        //create an appeal if every side is funded
        if(submissionCounter[round] == submissionCounter[round - 1]){
            arbitrator.appeal.value(appealCost)(disputeID, arbitratorExtraData);
            round++;
        }
    }

    function appeal()public {
        require(status == Status.DisputeCreated, "No dispute to appeal");
        require(arbitrator.disputeStatus(disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(disputeID);
        require(
            now - appealPeriodStart >= (appealPeriodEnd - appealPeriodStart) * 2/3 && now < appealPeriodEnd,
            "Appeal must be raised in the last third of appeal period."
        );

        require(submissionCounter[round] > 1, "Not enough submissions to create an appeal");
        uint appealCost = arbitrator.appealCost(disputeID, arbitratorExtraData);
        round++;
        arbitrator.appeal.value(appealCost)(disputeID, arbitratorExtraData);
    }


     /** @dev Give a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        require(msg.sender == address(arbitrator), "Must be called by the arbitrator");
        require(status == Status.DisputeCreated, "The dispute has already been resolved");
        //override the decision if one of the submissions was a duplicate with lower submission time or if it was the only side that paid appeal fee
        uint ruling = _ruling;
        for (uint i = 1; i <= submissionCounter[0]; i++){  
            if (i == ruling){ 
                continue;
            }
            if (txLists[submissions[i]].listHash == txLists[submissions[ruling]].listHash && txLists[submissions[i]].submissionTime < txLists[submissions[ruling]].submissionTime 
            || txLists[submissions[i]].appealFeePaid[round] && submissionCounter[round] == 1){
                ruling = i;
            } 
        }
        executeRuling(_disputeID, ruling); 
    }


    /** @dev Execute a ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal{
        //nothing is executed if ruling is not decided
        if(_ruling != 0){
            TransactionList storage txList = txLists[submissions[_ruling]];
            for (uint i = 0; i < txList.txCounter; i++){
                Transaction storage transaction = txList.transactions[i];
                require(!transaction.executed); // solium-disable-line error-reason
                transaction.executed = true;

                transaction.target.call.value(transaction.value)(transaction.data); // solium-disable-line security/no-call-value
            }
            //the reward is the submission deposit of losing parties minus arbitration fee
            uint reward = sumDeposit.subCap(txList.deposit);
            require(txList.sender.send(reward), "Was unable to send reward"); 
        }
        sumDeposit = 0;
        lastAction = now;
        status = Status.NoDispute;
        for (i = 0; i <= round; i++){
            submissionCounter[i] = 0;
        }
        round = 0;
        disputeID = 0;
    } 

    function getTransactionInfo(uint _listID, uint _transactionIndex)
        public
        view
        returns (
            uint ID,
            address target,
            uint value,
            bytes data,
            bool executed
        )
    {
        TransactionList storage txList = txLists[_listID];
        Transaction storage transaction = txList.transactions[_transactionIndex];
        return (
            transaction.ID,
            transaction.target,
            transaction.value,
            transaction.data,
            transaction.executed
        );
    }

    function isAppealFeePaid(uint _listID, uint _round) public view returns(bool){
        return txLists[_listID].appealFeePaid[_round];
    }
}
