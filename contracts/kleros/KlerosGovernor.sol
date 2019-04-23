/**
 *  @authors: [@unknownunknown1]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

/* solium-disable security/no-block-members */
pragma solidity ^0.4.24;

import "./KlerosLiquid.sol";
import "@kleros/kleros-interaction/contracts/libraries/CappedMath.sol";

contract KlerosGovernor is Arbitrable{
    using CappedMath for uint;
    
    /* *** Contract variables *** */
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.
    
    enum Status {NoDispute, DisputeCreated}

    struct Transaction{
        uint ID; // Hash of the transaction converted into uint. Is needed for sorting transactions in a list.
        address target; // The address that will execute the transaction.
        uint value; // Value paid by submitter that will be used as msg.value in the execution.
        bytes data; // Calldata of the transaction.
        bool executed; // Whether the transaction was already executed or not. Is needed to prevent re-entrancy.
    }
    struct TransactionList{
        address sender; // Submitter's address.
        uint deposit; // Value of a deposit paid upon submission of the list.
        mapping(uint => Transaction) transactions; // Transactions stored in the list.
        bytes32 listHash; // A hash chain of all transactions stored in the list. Is needed to catch duplicates.
        uint submissionTime; // Time the list was submitted.
        mapping(uint => bool) appealFeePaid; // Whether the appeal fee for the list has been paid in certain round.
        uint txCounter; // Number of stored transactions.
    }

    Status public status; // Status showing whether the contract has an ongoing dispute or not.
    uint public submissionDeposit; // Value in wei that needs to be paid in order to submit the list.
    uint public submissionTimeout; // Time in seconds allowed for submitting the lists. Once it's passed the contract enters the execution period which will end when the transaction list is executed.
    uint public withdrawTimeout; // Time in seconds allowed to withdraw a submitted list.
    
    uint public sumDeposit; // Sum of all submission deposits in a session. Is needed for calculating a reward.
    uint public lastAction; // The time of the last execution of a transaction list.

    uint public disputeID; // The ID of the dispute created in Kleros court.

    uint public round; // Current round of the dispute. 0 - dispute round, 1 and more - appeal rounds.
    mapping (uint => uint) public submissions; // Gives an index to a submitted list and maps it with respective index in array of transactions. Is needed to separate all created lists from the ones submitted in the current session.
    mapping(uint => uint) public submissionCounter; // Maps the round to the number of submissions made in it. For the appeal rounds submission is counted as payment for appeal fees.
    
    uint public sharedStakeMultiplier; // Multiplier for calculating the appeal fee that must be paid by submitter in the case where there isn't a winner and loser (e.g. when the arbitrator ruled "refused to rule"/"could not rule").
    uint public winnerStakeMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.
    
    TransactionList[] public txLists; // Stores all created transaction lists.
    
    /* *** Modifiers *** */
    modifier depositRequired() {require(msg.value >= submissionDeposit, "Submission deposit must be paid"); _;}
    modifier duringSubmissionPeriod() {require(now <= lastAction + submissionTimeout, "Submission time has ended"); _;}
    modifier duringExecutionPeriod() {require(now > lastAction + submissionTimeout, "Execution time has not started yet"); _;}

    /** @dev Constructor.
     *  @param _kleros The arbitrator of the contract.
     *  @param _extraData Extra data for the arbitrator.
     *  @param _submissionDeposit The deposit required for list submission.
     *  @param _submissionTimeout Time in seconds allocated for submitting transaction list.
     *  @param _withdrawTimeout Time in seconds after submission that allows to withdraw submitted list.
     *  @param _sharedStakeMultiplier Multiplier of the appeal cost that submitter must pay for a round when there isn't a winner/loser in the previous round. In basis points.
     *  @param _winnerStakeMultiplier Multiplier of the appeal cost that the winner has to pay for a round. In basis points.
     *  @param _loserStakeMultiplier Multiplier of the appeal cost that the loser has to pay for a round. In basis points.
     */
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
    
    /** @dev Creates an empty transaction list.
     *  @return listID The array index of the created list.
     */
    function createTransactionList() public duringSubmissionPeriod returns(uint listID){
        txLists.length++;
        listID = txLists.length - 1;
        TransactionList storage txList = txLists[listID];
        txList.sender = msg.sender;
    }
    
    /** @dev Adds a transaction to created list. Sorts added transactions by ID in the process.
     *  @param _listID The index of the transaction list in the array of lists.
     *  @param _target The target of the transaction.
     *  @param _data The calldata of the transaction.
     */
    function addTransactions(uint _listID, address _target, bytes _data) public payable duringSubmissionPeriod {
        TransactionList storage txList = txLists[_listID];
        require(txList.sender == msg.sender, "Can't add transactions to the list created by someone else");
        require(txList.submissionTime == 0, "List is already submitted");
        txList.txCounter++;
        uint ID = uint(keccak256(abi.encodePacked(_target, msg.value, _data)));
        uint index;
        bool found;
        // Transactions are sorted to catch lists with the same transactions that were added in different order.
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
    
    /** @dev Submits created transaction list so it can be executed in the execution period.
     *  @param _listID The index of the transaction list in the array of lists.
     */
    function submitTransactionList(uint _listID) public payable depositRequired duringSubmissionPeriod{
        TransactionList storage txList = txLists[_listID];
        require(txList.sender == msg.sender, "Can't submit the list created by someone else");
        require(txList.submissionTime == 0, "List is already submitted");
        txList.submissionTime = now;
        txList.deposit = submissionDeposit;
        // Stores the hash of the list to catch duplicates.
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
    
    /** @dev Withdraws submitted transaction list. Reimburses submission deposit.
     *  @param _submissionID The ID that was given to the list upon submission. For a newly submitted list its submission ID is equal to the total submission count.
     */
    function withdrawTransactionList(uint _submissionID) public duringSubmissionPeriod{
        require(_submissionID > 0 && _submissionID <= submissionCounter[0], "ID is out of range");
        TransactionList storage txList = txLists[submissions[_submissionID]];
        require(txList.sender == msg.sender, "Can't withdraw the list created by someone else");
        require(now - txList.submissionTime <= withdrawTimeout, "Withdrawing time has passed");
        uint deposit = txList.deposit;
        // Replace the ID of the withdrawn list with the last submitted list to close the gap.
        submissions[_submissionID] = submissions[submissionCounter[0]];
        delete submissions[submissionCounter[0]];
        submissionCounter[0]--;
        sumDeposit -= deposit;
        require(msg.sender.send(deposit), "Was unable to return deposit");
    }
    
    /** @dev Executes a transaction list or creates a dispute if more than one list was submitted. If nothing was submitted resets the period of the contract to the submission period.
     *  Note that the choices of created dispute mirror submission IDs of submitted lists.
     */
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
            // Freeze lastAction time so there would be no submissions untill the dispute is resolved.
            lastAction = 0;
            round++;
        }
    }
    
    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if all submitted lists are fully funded..
     *  @param _submissionID The ID that was given to the list upon submission.
     */
    function fundAppeal(uint _submissionID) public payable{
        require(_submissionID > 0 && _submissionID <= submissionCounter[0], "ID is out of range");
        require(status == Status.DisputeCreated, "No dispute to appeal");
        require(arbitrator.disputeStatus(disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(disputeID);
        // The last third of the appeal period is secured so it'd be possible to create an appeal manually if more than one but not all submitted lists have been funded.
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

        // Create an appeal if every side is funded.
        if(submissionCounter[round] == submissionCounter[round - 1]){
            arbitrator.appeal.value(appealCost)(disputeID, arbitratorExtraData);
            round++;
        }
    }
    
    /** @dev Allows to manually create an appeal if more than one but not all submitted lists are funded.
     *  Note that this function is only executable during the last third of the appeal period in order to know how many submitted lists have been funded.
     */
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


     /** @dev Gives a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint _disputeID, uint _ruling) public {
        require(msg.sender == address(arbitrator), "Must be called by the arbitrator");
        require(status == Status.DisputeCreated, "The dispute has already been resolved");
        // Override the decision if one of the submitted lists was a duplicate with lower submission time or if it was the only side that paid appeal fee.
        uint ruling = _ruling;
        for (uint i = 1; i <= submissionCounter[0]; i++){
            if (i == ruling){
                continue;
            }
            if (txLists[submissions[i]].listHash == txLists[submissions[ruling]].listHash && 
                txLists[submissions[i]].submissionTime < txLists[submissions[ruling]].submissionTime || 
                txLists[submissions[i]].appealFeePaid[round] && submissionCounter[round] == 1){
                ruling = i;
            }
        }
        executeRuling(_disputeID, ruling);
    }


    /** @dev Executes a ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal{
        // Nothing is executed if arbitrator refused to arbitrate.
        if(_ruling != 0){
            TransactionList storage txList = txLists[submissions[_ruling]];
            for (uint i = 0; i < txList.txCounter; i++){
                Transaction storage transaction = txList.transactions[i];
                require(!transaction.executed); // solium-disable-line error-reason
                transaction.executed = true;

                transaction.target.call.value(transaction.value)(transaction.data); // solium-disable-line security/no-call-value
            }
            // The reward is the submission deposit of losing parties minus arbitration fee.
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

    /** @dev Gets the info of the specified transaction in the specified list.
     *  @param _listID The index of the transaction list in the array of lists.
     *  @param _transactionIndex The index of the transaction.
     *  @return The transaction info.
     */
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
    
    /** @dev Returns true if the specified list in the specified round was funded.
     *  Note that for a dispute round this function will return false but it's not an issue since disputes are automatically funded with submission deposits anyway.
     *  @param _listID The index of the transaction list in the array of lists.
     *  @param _round The round of the dispute.
     *  @return Whether or not the appeal fee has been paid.
     */
    function isAppealFeePaid(uint _listID, uint _round) public view returns(bool){
        return txLists[_listID].appealFeePaid[_round];
    }
}
