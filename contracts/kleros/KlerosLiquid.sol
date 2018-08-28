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
      staking, // Stake sum trees can be updated. Pass after `minStakingTime` passes and at least one dispute was created
      generating, // Waiting on random number. Pass as soon as it is ready
      drawing // Jurors are drawn. Pass after all open disputes are drawn or `maxDrawingTime` passes
    }

    // Dispute
    enum Period {
      evidence, // Evidence can be submitted. This is also when drawing takes place
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
        address _address; // The address of the voter
        uint choice; // The choice of the voter
    }
    struct VoteCounter {
        uint winningChoice; // The choice with the most votes
        uint[] counts; // The sum of votes for each choice in the form `counts[choice]`
    }
    struct Dispute {
        Arbitrable arbitrated; // The arbitrated arbitrable contract
        uint choices; // The number of choices jurors have when voting
        Period period; // The current period of the dispute
        uint lastPeriodChange; // The last time the period was changed
        Vote[][] votes; // The votes in the form `votes[appeal][voteID]`
        VoteCounter[] voteCounters; // The vote counters in the form `voteCounters[appeal]`
        uint[] totalJurorFees; // The total juror fees paid in the form `totalJurorFees[appeal]`
        uint[] appealRepartitions; // The last repartitioned voteIDs in the form `appealRepartitions[appeal]`
    }

    /* Events */

    /** @dev Emitted when we pass to a new phase.
     *  @param phase The new phase.
     */
    event NewPhase(uint phase);

    /** @dev Emitted when a dispute passes to a new period.
     *  @param period The new period.
     */
    event NewPeriod(uint indexed disputeID, uint period);

    /** @dev Emitted when a voter is drawn.
     *  @param disputeID The ID of the dispute.
     *  @param arbitrable The arbitrable contract that is ruled by the dispute.
     *  @param _address The drawn address.
     */
    event Draw(uint indexed disputeID, Arbitrable indexed arbitrable, address indexed _address);

    /** @dev Emitted when a voter wins or loses tokens from a dispute.
     *  @param disputeID The ID of the dispute.
     *  @param _address The voter affected.
     *  @param amount The amount won or lost.
     */
    event TokenShift(uint indexed disputeID, address indexed _address, int amount);

    /** @dev Emitted when a voter wins ETH from a dispute.
     *  @param disputeID The ID of the dispute.
     *  @param _address The voter affected.
     *  @param amount The amount won.
     */
    event ArbitrationReward(uint indexed disputeID, address indexed _address, uint amount);

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
        courts.push(new Court({
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
        uint _subcourtID = courts.push(new Court({
            parent: _parent,
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
        if (courts[_parent].vacantChildrenIndexes.length) {
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

    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
