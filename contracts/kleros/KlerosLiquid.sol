pragma solidity ^0.4.24;

import "kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";
import "kleros-interaction/contracts/standard/arbitration/Arbitrable.sol";
import "kleros-interaction/contracts/standard/rng/RNG.sol";
import { MiniMeTokenERC20 as Pinakion } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

import "../data-structures/SortitionSumTreeFactory.sol";

/**
 *  @title KlerosLiquid
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev The main Kleros contract with dispute resolution logic for the Athena release.
 */
contract KlerosLiquid is SortitionSumTreeFactory, Arbitrator {
    /* Enums */

    // General
    enum Phase {
      staking, // Stake sum trees can be updated. Pass after `minStakingTime` passes and there is at least one dispute without jurors
      generating, // Waiting on random number. Pass as soon as it is ready
      drawing // Jurors can be drawn. Pass after all disputes have jurors or `maxDrawingTime` passes
    }

    // Dispute
    enum Period {
      evidence, // Evidence can be submitted. This is also when drawing has to take place
      commit, // Jurors commit a hashed vote. This is skipped if not a hidden court
      vote, // Jurors reveal/cast their vote depending on wether the court is hidden or not
      appeal, // The dispute can be appealed
      execution // Tokens are redistributed and the ruling is executed
    }

    /* Structs */

    // General
    struct Court {
        uint parent; // The parent court
        uint[] children; // List of child courts
        uint[] vacantChildrenIndexes; // Stack of vacant slots in the children list
        bool hidden; // Wether to use commit and reveal or not
        uint minStake; // Minimum PNK needed to stake in the court
        uint alpha; // Percentage of PNK that is lost when incoherent (alpha / 10000)
        uint jurorFee; // Arbitration fee paid to each juror
        uint minJurors; // The minimum number of jurors required per dispute
        // The appeal after the one that reaches this number of jurors will go to the parent court if any, otherwise, no more appeals are possible
        uint jurorsForJump;
        uint[4] timesPerPeriod; // The time allotted to each dispute period in the form `timesPerPeriod[period]`
        bytes32 sortitionSumTreeKey; // The key of the sortition sum tree
    }

    // Dispute
    struct Vote {
        address _address; // The address of the juror
        uint choice; // The choice of the juror
    }
    struct VoteCounter {
        uint winningChoice; // The choice with the most votes
        uint[] counts; // The sum of votes for each choice in the form `counts[choice]`
    }
    struct Dispute {
        uint subcourtID; // The ID of the subcourt the dispute is in
        Arbitrable arbitrated; // The arbitrated arbitrable contract
        uint choices; // The number of choices jurors have when voting
        Period period; // The current period of the dispute
        uint lastPeriodChange; // The last time the period was changed
        Vote[][] votes; // The votes in the form `votes[appeal][voteID]`
        VoteCounter[] voteCounters; // The vote counters in the form `voteCounters[appeal]`
        uint[] totalJurorFees; // The total juror fees paid in the form `totalJurorFees[appeal]`
        uint[] appealDraws; // The next voteIDs to draw in the form `appealDraws[appeal]`
        uint[] appealCommits; // The number of commits in the form `appealCommits[appeal]`
        uint[] appealVotes; // The number of votes in the form `appealVotes[appeal]`
        uint[] appealRepartitions; // The next voteIDs to repartition tokens/eth for in the form `appealRepartitions[appeal]`
    }

    /* Events */

    /** @dev Emitted when we pass to a new phase.
     *  @param phase The new phase.
     */
    event NewPhase(Phase phase);

    /** @dev Emitted when a dispute passes to a new period.
     *  @param period The new period.
     */
    event NewPeriod(uint indexed disputeID, Period period);

    /** @dev Emitted when a juror is drawn.
     *  @param disputeID The ID of the dispute.
     *  @param arbitrable The arbitrable contract that is ruled by the dispute.
     *  @param _address The drawn address.
     */
    event Draw(uint indexed disputeID, Arbitrable indexed arbitrable, address indexed _address);

    /** @dev Emitted when a juror wins or loses tokens and ETH from a dispute.
     *  @param disputeID The ID of the dispute.
     *  @param _address The juror affected.
     *  @param tokenAmount The amount of tokens won or lost.
     *  @param ETHAmount The amount of ETH won or lost.
     */
    event TokenAndETHShift(uint indexed disputeID, address indexed _address, int tokenAmount, int ETHAmount);

    /* Storage */

    // General Constants
    uint public constant NON_PAYABLE_AMOUNT = (2 ** 256 - 2) / 2;
    uint public constant ALPHA_DIVISOR = 1e4;
    // General Contracts
    address public governor;
    Pinakion public pinakion;
    RNG public _RNG;
    // General Dynamic
    Phase public phase;
    uint public lastPhaseChange;
    uint public disputesWithoutJurors;
    uint public RNBlock;
    uint public RN;
    uint public minStakingTime;
    uint public maxDrawingTime;
    // General Storage
    Court[] public courts;

    // Dispute
    Dispute[] public disputes;

    /* Modifiers */

    /** @dev Requires a specific phase.
     *  @param _phase The required phase.
     */
    modifier onlyDuringPhase(Phase _phase) {require(phase == _phase, "Incorrect phase."); _;}

    /** @dev Requires a specific period in a dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _period The required period.
     */
    modifier onlyDuringPeriod(uint _disputeID, Period _period) {require(disputes[_disputeID].period == _period, "Incorrect period."); _;}

    /** @dev Requires that the sender is the governor. */
    modifier onlyByGovernor() {require(governor == msg.sender, "Can only be called by the governor."); _;}

    /* Constructor */

    /** @dev Constructs the KlerosLiquid contract.
     *  @param _governor The governor's address.
     *  @param _pinakion The address of the token contract.
     *  @param __RNG The address of the RNG contract.
     *  @param _minStakingTime The minimum time that the staking phase should last.
     *  @param _maxDrawingTime The maximum time that the drawing phase should last.
     *  @param _hidden The `hidden` property value of the general court.
     *  @param _minStake The `minStake` property value of the general court.
     *  @param _alpha The `alpha` property value of the general court.
     *  @param _jurorFee The `jurorFee` property value of the general court.
     *  @param _minJurors The `minJurors` property value of the general court.
     *  @param _jurorsForJump The `jurorsForJump` property value of the general court.
     *  @param _timesPerPeriod The `timesPerPeriod` property value of the general court.
     *  @param _sortitionSumTreeK The number of children per node of the general court's sortition sum tree.
     */
    constructor(
        address _governor,
        Pinakion _pinakion,
        RNG __RNG,
        uint _minStakingTime,
        uint _maxDrawingTime,
        bool _hidden,
        uint _minStake,
        uint _alpha,
        uint _jurorFee,
        uint _minJurors,
        uint _jurorsForJump,
        uint[4] _timesPerPeriod,
        uint _sortitionSumTreeK
    ) public {
        // Initialize contract
        governor = _governor;
        pinakion = _pinakion;
        _RNG = __RNG;
        minStakingTime = _minStakingTime;
        maxDrawingTime = _maxDrawingTime;
        lastPhaseChange = block.timestamp; // solium-disable-line security/no-block-members

        // Create the general court
        courts.push(Court({
            parent: 0,
            children: new uint[](0),
            vacantChildrenIndexes: new uint[](0),
            hidden: _hidden,
            minStake: _minStake,
            alpha: _alpha,
            jurorFee: _jurorFee,
            minJurors: _minJurors,
            jurorsForJump: _jurorsForJump,
            timesPerPeriod: _timesPerPeriod,
            sortitionSumTreeKey: bytes32(0)
        }));
        createTree(bytes32(0), _sortitionSumTreeK);
    }

    /* External */

    /** @dev Changes the `governor` storage variable.
     *  @param _governor The new value for the `governor` storage variable.
     */
    function changeGovernor(address _governor) external onlyByGovernor {
        governor = _governor;
    }

    /** @dev Changes the `pinakion` storage variable.
     *  @param _pinakion The new value for the `pinakion` storage variable.
     */
    function changePinakion(Pinakion _pinakion) external onlyByGovernor {
        pinakion = _pinakion;
    }

    /** @dev Changes the `_RNG` storage variable.
     *  @param __RNG The new value for the `_RNG` storage variable.
     */
    function change_RNG(RNG __RNG) external onlyByGovernor {
        _RNG = __RNG;
    }

    /** @dev Changes the `minStakingTime` storage variable.
     *  @param _minStakingTime The new value for the `minStakingTime` storage variable.
     */
    function changeMinStakingTime(uint _minStakingTime) external onlyByGovernor {
        minStakingTime = _minStakingTime;
    }

    /** @dev Changes the `maxDrawingTime` storage variable.
     *  @param _maxDrawingTime The new value for the `maxDrawingTime` storage variable.
     */
    function changeMaxDrawingTime(uint _maxDrawingTime) external onlyByGovernor {
        maxDrawingTime = _maxDrawingTime;
    }

    /** @dev Creates a subcourt under a specified parent court.
     *  @param _parent The `parent` property value of the subcourt.
     *  @param _hidden The `hidden` property value of the subcourt.
     *  @param _minStake The `minStake` property value of the subcourt.
     *  @param _alpha The `alpha` property value of the subcourt.
     *  @param _jurorFee The `jurorFee` property value of the subcourt.
     *  @param _minJurors The `minJurors` property value of the subcourt.
     *  @param _jurorsForJump The `jurorsForJump` property value of the subcourt.
     *  @param _timesPerPeriod The `timesPerPeriod` property value of the subcourt.
     *  @param _sortitionSumTreeK The number of children per node of the subcourt's sortition sum tree.
     */
    function createSubcourt(
        uint _parent,
        bool _hidden,
        uint _minStake,
        uint _alpha,
        uint _jurorFee,
        uint _minJurors,
        uint _jurorsForJump,
        uint[4] _timesPerPeriod,
        uint _sortitionSumTreeK
    ) external onlyByGovernor {
        // Create the subcourt
        uint _subcourtID = courts.push(Court({
            parent: _parent,
            children: new uint[](0),
            vacantChildrenIndexes: new uint[](0),
            hidden: _hidden,
            minStake: _minStake,
            alpha: _alpha,
            jurorFee: _jurorFee,
            minJurors: _minJurors,
            jurorsForJump: _jurorsForJump,
            timesPerPeriod: _timesPerPeriod,
            sortitionSumTreeKey: bytes32(courts.length)
        })) - 1;
        createTree(bytes32(_subcourtID), _sortitionSumTreeK);

        // Update the parent
        if (courts[_parent].vacantChildrenIndexes.length > 0) {
            uint _vacantIndex = courts[_parent].vacantChildrenIndexes[courts[_parent].vacantChildrenIndexes.length - 1];
            courts[_parent].vacantChildrenIndexes.length--;
            courts[_parent].children[_vacantIndex] = _subcourtID;
        } else courts[_parent].children.push(_subcourtID);
    }

    /** @dev Move a subcourt to a new parent.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _parent The new `parent` property value of the subcourt.
     */
    function moveSubcourt(uint _subcourtID, uint _parent) external onlyByGovernor {
        // Update the old parent's children, if any
        for (uint i = 0; i < courts[courts[_subcourtID].parent].children.length; i++)
            if (courts[courts[_subcourtID].parent].children[i] == _subcourtID) {
                delete courts[courts[_subcourtID].parent].children[i];
                courts[courts[_subcourtID].parent].vacantChildrenIndexes.push(i);
            }
        
        // Set the new parent
        courts[_subcourtID].parent = _parent;
    }

    /** @dev Changes the `hidden` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _hidden The new value for the `hidden` property value.
     */
    function changeSubcourtHidden(uint _subcourtID, bool _hidden) external onlyByGovernor {
        courts[_subcourtID].hidden = _hidden;
    }

    /** @dev Changes the `minStake` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _minStake The new value for the `minStake` property value.
     */
    function changeSubcourtMinStake(uint _subcourtID, uint _minStake) external onlyByGovernor {
        courts[_subcourtID].minStake = _minStake;
    }

    /** @dev Changes the `alpha` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _alpha The new value for the `alpha` property value.
     */
    function changeSubcourtAlpha(uint _subcourtID, uint _alpha) external onlyByGovernor {
        courts[_subcourtID].alpha = _alpha;
    }

    /** @dev Changes the `jurorFee` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _jurorFee The new value for the `jurorFee` property value.
     */
    function changeSubcourtJurorFee(uint _subcourtID, uint _jurorFee) external onlyByGovernor {
        courts[_subcourtID].jurorFee = _jurorFee;
    }

    /** @dev Changes the `minJurors` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _minJurors The new value for the `minJurors` property value.
     */
    function changeSubcourtMinJurors(uint _subcourtID, uint _minJurors) external onlyByGovernor {
        courts[_subcourtID].minJurors = _minJurors;
    }

    /** @dev Changes the `jurorsForJump` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _jurorsForJump The new value for the `jurorsForJump` property value.
     */
    function changeSubcourtJurorsForJump(uint _subcourtID, uint _jurorsForJump) external onlyByGovernor {
        courts[_subcourtID].jurorsForJump = _jurorsForJump;
    }

    /** @dev Changes the `timesPerPeriod` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _timesPerPeriod The new value for the `timesPerPeriod` property value.
     */
    function changeSubcourtTimesPerPeriod(uint _subcourtID, uint[4] _timesPerPeriod) external onlyByGovernor {
        courts[_subcourtID].timesPerPeriod = _timesPerPeriod;
    }

    /** @dev Pass the phase. */
    function passPhase() external {
        if (phase == Phase.staking) {
            // solium-disable-next-line security/no-block-members
            require(block.timestamp - lastPhaseChange >= minStakingTime, "The minimum staking time has not passed yet.");
            require(disputesWithoutJurors > 0, "There are no disputes without jurors.");
            RNBlock = block.number + 1;
            _RNG.requestRN(RNBlock);
            phase = Phase.generating;
        } else if (phase == Phase.generating) {
            RN = _RNG.getUncorrelatedRN(RNBlock);
            require(RN != 0, "Random number is not ready yet.");
            phase = Phase.drawing;
        } else if (phase == Phase.drawing) {
            // solium-disable-next-line security/no-block-members
            require(disputesWithoutJurors == 0 || block.timestamp - lastPhaseChange >= maxDrawingTime, "There are still disputes without jurors and the maximum drawing time has not passed yet.");
            phase = Phase.staking;
        }

        // solium-disable-next-line security/no-block-members
        lastPhaseChange = block.timestamp;
        emit NewPhase(phase);
    }

    /** @dev Pass the period of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     */
    function passPeriod(uint _disputeID) external {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period == Period.evidence) {
            // solium-disable-next-line security/no-block-members
            require(block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)], "The evidence period time has not passed yet.");
            require(dispute.appealDraws[dispute.appealDraws.length - 1] == dispute.votes[dispute.votes.length - 1].length, "The dispute has not finished drawing yet.");
            dispute.period = courts[dispute.subcourtID].hidden ? Period.commit : Period.vote;
        } else if (dispute.period == Period.commit) {
            require(
                // solium-disable-next-line security/no-block-members
                block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.appealCommits[dispute.appealCommits.length - 1] == dispute.votes[dispute.votes.length - 1].length,
                "The commit period time has not passed yet and not every juror has committed yet."
            );
            dispute.period = Period.vote;
        } else if (dispute.period == Period.vote) {
            require(
                // solium-disable-next-line security/no-block-members
                block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.appealVotes[dispute.appealVotes.length - 1] == dispute.votes[dispute.votes.length - 1].length,
                "The vote period time has not passed yet and not every juror has voted yet."
            );
            dispute.period = Period.appeal;
        } else if (dispute.period == Period.appeal) {
            // solium-disable-next-line security/no-block-members
            require(block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)], "The appeal period time has not passed yet.");
            dispute.period = Period.execution;
        } else if (dispute.period == Period.execution) {
            revert("The dispute is already in the last period.");
        }

        // solium-disable-next-line security/no-block-members
        dispute.lastPeriodChange = block.timestamp;
        emit NewPeriod(_disputeID, dispute.period);
    }

    /* External Views */

    

    /* Public */

    /** @dev Creates a dispute. Must be called by the arbitrable contract.
     *  @param _subcourtID The ID of the subcourt to create the dispute in.
     *  @param _choices Number of choices to choose from in the dispute to be created.
     *  @param _extraData Additional info about the dispute to be created.
     *  @return The ID of the created dispute.
     */
    function createDispute(
        uint _subcourtID,
        uint _choices,
        bytes _extraData
    ) public payable requireArbitrationFee(_extraData) returns(uint disputeID)  {
        disputeID = disputes.push(Dispute({
            subcourtID: _subcourtID,
            arbitrated: Arbitrable(msg.sender),
            choices: _choices,
            period: Period.evidence,
            // solium-disable-next-line security/no-block-members
            lastPeriodChange: block.timestamp,
            votes: new Vote[][](0),
            voteCounters: new VoteCounter[](0),
            totalJurorFees: new uint[](0),
            appealDraws: new uint[](0),
            appealCommits: new uint[](0),
            appealVotes: new uint[](0),
            appealRepartitions: new uint[](0)
        })) - 1;
        Dispute storage dispute = disputes[disputeID];
        dispute.votes.push(new Vote[](msg.value / courts[dispute.subcourtID].jurorFee));
        dispute.voteCounters.push(VoteCounter({ winningChoice: 0, counts: new uint[](dispute.choices) }));
        dispute.totalJurorFees.push(msg.value);
        dispute.appealDraws.push(0);
        dispute.appealCommits.push(0);
        dispute.appealVotes.push(0);
        dispute.appealRepartitions.push(0);
        disputesWithoutJurors++;

        emit DisputeCreation(disputeID, Arbitrable(msg.sender));
    }

    /** @dev Appeal the ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     */
    function appeal(
        uint _disputeID,
        bytes _extraData
    ) public payable requireAppealFee(_disputeID, _extraData) onlyDuringPeriod(_disputeID, Period.appeal) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.votes[dispute.votes.length - 1].length >= courts[dispute.subcourtID].jurorsForJump) // Jump to parent subcourt
            dispute.subcourtID = courts[dispute.subcourtID].parent;
        dispute.period = Period.evidence;
        dispute.votes.push(new Vote[](msg.value / courts[dispute.subcourtID].jurorFee));
        dispute.voteCounters.push(VoteCounter({ winningChoice: 0, counts: new uint[](dispute.choices) }));
        dispute.totalJurorFees.push(msg.value);
        dispute.appealDraws.push(0);
        dispute.appealCommits.push(0);
        dispute.appealVotes.push(0);
        dispute.appealRepartitions.push(0);
        disputesWithoutJurors++;

        emit AppealDecision(_disputeID, Arbitrable(msg.sender));
    }

    /* Public Views */

    /** @dev Get the cost of arbitration in a specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _extraData Additional info about the dispute.
     *  @return The cost.
     */
    function arbitrationCost(uint _subcourtID, bytes _extraData) public view returns(uint cost) {
        cost = courts[_subcourtID].jurorFee * courts[_subcourtID].minJurors;
    }

    /** @dev Get the cost of appealing a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     *  @return The cost.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
        Dispute storage dispute = disputes[_disputeID];
        uint _lastNumberOfJurors = dispute.votes[dispute.votes.length - 1].length;
        if (_lastNumberOfJurors >= courts[dispute.subcourtID].jurorsForJump) // Jump to parent subcourt
            if (dispute.subcourtID == 0) // Already in the general court
                cost = NON_PAYABLE_AMOUNT;
            else
                cost = courts[courts[dispute.subcourtID].parent].jurorFee * courts[courts[dispute.subcourtID].parent].minJurors;
        else // Stay in current subcourt
            cost = courts[dispute.subcourtID].jurorFee * ((_lastNumberOfJurors * 2) + 1);
    }

    /** @dev Get the status of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return The status.
     */
    function disputeStatus(uint _disputeID) public view returns(DisputeStatus status) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period < Period.appeal) status = DisputeStatus.Waiting;
        else if (dispute.period < Period.execution) status = DisputeStatus.Appealable;
        else status = DisputeStatus.Solved;
    }

    /** @dev Get the current ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return The current ruling.
     */
    function currentRuling(uint _disputeID) public view returns(uint ruling) {
        Dispute storage dispute = disputes[_disputeID];
        ruling = dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
    }

    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
