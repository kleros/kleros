/**
 *  @authors: [@unknownunknown1]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

/* solium-disable security/no-block-members */
/* solium-disable max-len*/

pragma solidity ^0.4.24;

import "@kleros/kleros-interaction/contracts/standard/arbitration/Arbitrable.sol";
import "@kleros/kleros-interaction/contracts/libraries/CappedMath.sol";

contract KlerosGovernor is Arbitrable{
    using CappedMath for uint;

    /* *** Contract variables *** */
    enum Status {NoDispute, DisputeCreated}

    struct Transaction{
        address target; // The address to call.
        uint value; // Value paid by governor contract that will be used as msg.value in the execution.
        bytes data; // Calldata of the transaction.
        bool executed; // Whether the transaction was already executed or not.
    }
    struct TransactionList{
        address sender; // Submitter.
        uint deposit; // Value of a deposit paid upon submission of the list.
        Transaction[] txs; // Transactions stored in the list. txs[_transactionIndex].
        bytes32 listHash; // A hash chain of all transactions stored in the list. Is needed to catch duplicates.
        uint submissionTime; // Time the list was submitted.
        bool approved; // Whether the list was approved for execution or not.
    }

    Status public status; // Status showing whether the contract has an ongoing dispute or not.
    address public governor; // The address that can make governance changes to the parameters.

    uint public submissionDeposit; // Value in wei that needs to be paid in order to submit the list.
    uint public submissionTimeout; // Time in seconds allowed for submitting the lists. Once it's passed the contract enters the approval period.
    uint public withdrawTimeout; // Time in seconds allowed to withdraw a submitted list.
    uint public sharedMultiplier; // Multiplier for calculating the appeal fee that must be paid by submitter in the case where there is no winner/loser (e.g. when the arbitrator ruled "refuse to arbitrate").
    uint public winnerMultiplier; // Multiplier for calculating the appeal fee of the party that won the previous round.
    uint public loserMultiplier; // Multiplier for calculating the appeal fee of the party that lost the previous round.
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.

    uint public sumDeposit; // Sum of all submission deposits in a current submission period (minus arbitration fees). Is needed for calculating a reward.
    uint public lastApprovalTime; // The time of the last approval of a transaction list.
    uint public disputeID; // The ID of the dispute created in arbitrator contract.
    uint public shadowWinner = uint(-1); // Submission index of the first list that paid appeal fees. If it stays the only list that paid appeal fees it will win regardless of the final ruling.

    TransactionList[] public txLists; // Stores all created transaction lists. txLists[_listID].
    uint[] public submittedLists; // Stores all lists submitted in a current submission period. Is cleared after each submitting session. submittedLists[_submissionID].

    /* *** Modifiers *** */
    modifier duringSubmissionPeriod() {require(now - lastApprovalTime <= submissionTimeout, "Submission time has ended"); _;}
    modifier duringApprovalPeriod() {require(now - lastApprovalTime > submissionTimeout, "Approval time has not started yet"); _;}
    modifier onlyByGovernor() {require(governor == msg.sender, "Only the governor can execute this"); _;}

    /** @dev Constructor.
     *  @param _arbitrator The arbitrator of the contract.
     *  @param _extraData Extra data for the arbitrator.
     *  @param _submissionDeposit The deposit required for submission.
     *  @param _submissionTimeout Time in seconds allocated for submitting transaction list.
     *  @param _withdrawTimeout Time in seconds after submission that allows to withdraw submitted list.
     *  @param _sharedMultiplier Multiplier of the appeal cost that submitter has to pay for a round when there is no winner/loser in the previous round. In basis points.
     *  @param _winnerMultiplier Multiplier of the appeal cost that the winner has to pay for a round. In basis points.
     *  @param _loserMultiplier Multiplier of the appeal cost that the loser has to pay for a round. In basis points.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _extraData,
        uint _submissionDeposit,
        uint _submissionTimeout,
        uint _withdrawTimeout,
        uint _sharedMultiplier,
        uint _winnerMultiplier,
        uint _loserMultiplier
    ) public Arbitrable(_arbitrator, _extraData){
        lastApprovalTime = now;
        submissionDeposit = _submissionDeposit;
        submissionTimeout = _submissionTimeout;
        withdrawTimeout = _withdrawTimeout;
        sharedMultiplier = _sharedMultiplier;
        winnerMultiplier = _winnerMultiplier;
        loserMultiplier = _loserMultiplier;
        governor = address(this);
    }

    /** @dev Changes the value of the deposit required for submitting a list.
     *  @param _submissionDeposit The new value of a required deposit. In wei.
     */
    function changeSubmissionDeposit(uint _submissionDeposit) public onlyByGovernor {
        submissionDeposit = _submissionDeposit;
    }

    /** @dev Changes the time allocated for submission.
     *  @param _submissionTimeout The new duration of submission time. In seconds.
     */
    function changeSubmissionTimeout(uint _submissionTimeout) public onlyByGovernor {
        submissionTimeout = _submissionTimeout;
    }

    /** @dev Changes the time allowed for list withdrawal.
     *  @param _withdrawTimeout The new duration of withdraw timeout. In seconds.
     */
    function changeWithdrawTimeout(uint _withdrawTimeout) public onlyByGovernor {
        withdrawTimeout = _withdrawTimeout;
    }

    /** @dev Changes the percentage of appeal fees that must be added to appeal cost when there is no winner or loser.
     *  @param _sharedMultiplier The new shared mulitplier value.
     */
    function changeSharedMultiplier(uint _sharedMultiplier) public onlyByGovernor {
        sharedMultiplier = _sharedMultiplier;
    }

    /** @dev Changes the percentage of appeal fees that must be added to appeal cost for the winning party.
     *  @param _winnerMultiplier The new winner mulitplier value.
     */
    function changeWinnerMultiplier(uint _winnerMultiplier) public onlyByGovernor {
        winnerMultiplier = _winnerMultiplier;
    }

    /** @dev Changes the percentage of appeal fees that must be added to appeal cost for the losing party.
     *  @param _loserMultiplier The new loser mulitplier value.
     */
    function changeLoserMultiplier(uint _loserMultiplier) public onlyByGovernor {
        loserMultiplier = _loserMultiplier;
    }

    /** @dev Creates transaction list based on input parameters and submits it for potential approval and execution.
     *  @param _target List of addresses to call.
     *  @param _value List of values required for respective addresses.
     *  @param _data Concatenated calldata of all transactions of this list.
     *  @param _dataSize List of lengths in bytes required to split calldata for its respective targets.
     *  @return submissionID The ID that was given to the list upon submission. Starts with 0.
     */
    function submitList(address[] _target, uint[] _value, bytes _data, uint[] _dataSize) public payable duringSubmissionPeriod returns(uint submissionID){
        require(_target.length == _value.length, "Incorrect input. Target and value arrays must be of the same length");
        require(_target.length == _dataSize.length, "Incorrect input. Target and datasize arrays must be of the same length");
        require(msg.value >= submissionDeposit, "Submission deposit must be paid");
        txLists.length++;
        uint listID = txLists.length - 1;
        TransactionList storage txList = txLists[listID];
        txList.sender = msg.sender;
        txList.deposit = submissionDeposit;
        bytes32 listHash;
        uint pointer;
        for (uint i = 0; i < _target.length; i++){
            bytes memory tempData = new bytes(_dataSize[i]);
            Transaction storage transaction = txList.txs[txList.txs.length++];
            transaction.target = _target[i];
            transaction.value = _value[i];
            for (uint j = 0; j < _dataSize[i]; j++){
                tempData[j] = _data[j + pointer];
            }
            transaction.data = tempData;
            pointer += _dataSize[i];
            if (i == 0) {
                listHash = keccak256(abi.encodePacked(transaction.target, transaction.value, transaction.data));
            } else {
                listHash = keccak256(abi.encodePacked(keccak256(abi.encodePacked(transaction.target, transaction.value, transaction.data)), listHash));
            }
        }
        for (i = 0; i < submittedLists.length; i++){
            require(listHash != txLists[submittedLists[i]].listHash, "The same list was already submitted earlier");
        }
        txList.listHash = listHash;
        txList.submissionTime = now;
        sumDeposit += submissionDeposit;
        submissionID = submittedLists.push(listID);

        uint remainder = msg.value - submissionDeposit;
        if (remainder > 0) msg.sender.send(remainder);
    }

    /** @dev Withdraws submitted transaction list. Reimburses submission deposit.
     *  @param _submissionID The ID that was given to the list upon submission.
     */
    function withdrawTransactionList(uint _submissionID) public duringSubmissionPeriod{
        TransactionList storage txList = txLists[submittedLists[_submissionID]];
        require(txList.sender == msg.sender, "Can't withdraw the list created by someone else");
        require(now - txList.submissionTime <= withdrawTimeout, "Withdrawing time has passed");
        submittedLists[_submissionID] = submittedLists[submittedLists.length - 1];
        submittedLists.length--;
        sumDeposit = sumDeposit.subCap(txList.deposit);
        msg.sender.transfer(txList.deposit);
    }

    /** @dev Approves a transaction list or creates a dispute if more than one list was submitted.
     *  If nothing was submitted resets the period of the contract to the submission period.
     */
    function approveTransactionList() public duringApprovalPeriod{
        require(status == Status.NoDispute, "Can't execute transaction list while dispute is active");
        if (submittedLists.length == 0){
            lastApprovalTime = now;
        } else if (submittedLists.length == 1){
            TransactionList storage txList = txLists[submittedLists[0]];
            txList.approved = true;
            txList.sender.send(sumDeposit);
            submittedLists.length--;
            sumDeposit = 0;
            lastApprovalTime = now;
        } else {
            status = Status.DisputeCreated;
            uint arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
            disputeID = arbitrator.createDispute.value(arbitrationCost)(submittedLists.length, arbitratorExtraData);
            sumDeposit = sumDeposit.subCap(arbitrationCost);
        }
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if at least two lists are funded.
     *  @param _submissionID The ID that was given to the list upon submission.
     */
    function fundAppeal(uint _submissionID) public payable{
        require(status == Status.DisputeCreated, "No dispute to appeal");
        require(arbitrator.disputeStatus(disputeID) == Arbitrator.DisputeStatus.Appealable, "Dispute is not appealable.");
        (uint appealPeriodStart, uint appealPeriodEnd) = arbitrator.appealPeriod(disputeID);
        require(
            now >= appealPeriodStart && now < appealPeriodEnd,
            "Appeal fees must be paid within the appeal period."
        );

        TransactionList storage txList = txLists[submittedLists[_submissionID]];
        require(_submissionID != shadowWinner, "Appeal fee has already been paid");

        if(shadowWinner == uint(-1)) shadowWinner = _submissionID;

        uint winner = arbitrator.currentRuling(disputeID);
        uint multiplier;
        // Unlike in submittedLists, in arbitrator "0" is reserved for "refuse to arbitrate" option. So we need to add 1 to map submission IDs with choices correctly.
        if (winner == _submissionID + 1){
            multiplier = winnerMultiplier;
        } else if (winner == 0){
            multiplier = sharedMultiplier;
        } else {
            require(now - appealPeriodStart < (appealPeriodEnd - appealPeriodStart)/2, "The loser must pay during the first half of the appeal period.");
            multiplier = loserMultiplier;
        }

        uint appealCost = arbitrator.appealCost(disputeID, arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);
        sumDeposit += totalCost;

        require(msg.value >= totalCost, "Not enough ETH to cover appeal cost");
        uint remainder = msg.value - totalCost;
        if (remainder > 0) txList.sender.send(remainder);

        if(shadowWinner != uint(-1) && shadowWinner != _submissionID){
            shadowWinner = uint(-1);
            arbitrator.appeal.value(appealCost)(disputeID, arbitratorExtraData);
            sumDeposit = sumDeposit.subCap(appealCost);
        }
    }

    /** @dev Gives a ruling for a dispute. Must be called by the arbitrator.
     *  The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refuse to arbitrate".
     */
    function rule(uint _disputeID, uint _ruling) public {
        require(msg.sender == address(arbitrator), "Must be called by the arbitrator");
        require(status == Status.DisputeCreated, "The dispute has already been resolved");
        require(_ruling <= submittedLists.length, "Ruling is out of bounds");
        uint ruling = _ruling;
        if(shadowWinner != uint(-1))
            ruling = shadowWinner + 1;

        executeRuling(_disputeID, ruling);
    }

    /** @dev Executes a ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refuse to arbitrate".
     *  If the final ruling is "0" nothing is approved and deposits will stay locked in the contract.
     */
    function executeRuling(uint _disputeID, uint _ruling) internal{
        if(_ruling != 0){
            TransactionList storage txList = txLists[submittedLists[_ruling - 1]];
            txList.approved = true;
            uint reward = sumDeposit.subCap(txList.deposit);
            txList.sender.send(reward);
        }
        sumDeposit = 0;
        disputeID = 0;
        shadowWinner = uint(-1);
        delete submittedLists;
        lastApprovalTime = now;
        status = Status.NoDispute;
    }

    /** @dev Executes selected transactions of the list.
     *  @param _listID The index of the transaction list in the array of lists.
     *  @param _cursor Index of the transaction from which to start executing.
     *  @param _count Number of transactions to execute. Executes until the end if set to "0" or number higher than number of transactions in the list.
     */
    function executeTransactionList(uint _listID, uint _cursor, uint _count) public {
        TransactionList storage txList = txLists[_listID];
        require(txList.approved, "Can't execute list that wasn't approved");
        for (uint i = _cursor; i < txList.txs.length && (_count == 0 || i < _cursor + _count) ; i++){
            Transaction storage transaction = txList.txs[i];
            if (transaction.executed || transaction.value > address(this).balance) continue;
            transaction.executed = transaction.target.call.value(transaction.value)(transaction.data); // solium-disable-line security/no-call-value
        }
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
            address target,
            uint value,
            bytes data,
            bool executed
        )
    {
        TransactionList storage txList = txLists[_listID];
        Transaction storage transaction = txList.txs[_transactionIndex];
        return (
            transaction.target,
            transaction.value,
            transaction.data,
            transaction.executed
        );
    }

    /** @dev Gets the number of transactions in the list.
     *  @param _listID The index of the transaction list in the array of lists.
     *  @return txCount The number of transactions in the list.
     */
    function getNumberOfTransactions(uint _listID) public view returns (uint txCount){
        TransactionList storage txList = txLists[_listID];
        return txList.txs.length;
    }

    /** @dev Gets the number of lists submitted in this session.
     *  @return The number of submitted lists.
     */
    function getNumberOfSubmittedLists() public view returns (uint){
        return submittedLists.length;
    }

    /** @dev Gets the number of lists created in contract's lifetime.
     *  @return The number of created lists.
     */
    function getNumberOfCreatedLists() public view returns (uint){
        return txLists.length;
    }
}