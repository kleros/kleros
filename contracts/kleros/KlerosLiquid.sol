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
        Court parent; // The parent court
        Court[] children; // List of child courts
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

    /** @dev Requires a specific period.
     *  @param _period The required period.
     */
    modifier onlyDuringPeriod(Period _period) {require(period == _period, "Incorrect period."); _;}

    /** @dev Requires that the sender is the governor. */
    modifier onlyByGovernor() {require(governor == msg.sender, "Can only be called by the governor."); _;}

    /* Constructor */

    /** @dev Constructs the KlerosLiquid contract.
     *  @param _governor The governor's address.
     *  @param _pinakion The address of the token contract.
     *  @param __RNG The address of the RNG contract.
     *  @param _minStakingTime The minimum time that the staking phase should last.
     *  @param _maxDrawingTime The maximum time that the drawing phase should last.
     */
    constructor(address _governor, Pinakion _pinakion, RNG __RNG, uint _minStakingTime, uint _maxDrawingTime) public {
        governor = _governor;
        pinakion = _pinakion;
        _RNG = __RNG;
        minStakingTime = _minStakingTime;
        maxDrawingTime = _maxDrawingTime;
        lastPhaseChange = block.timestamp; // solium-disable-line security/no-block-members
    }

    /* Fallback */



    /* External */



    /* External Views */



    /* Public */



    /* Public Views */



    /* Internal */



    /* Internal Views */



    /* Private */



    /* Private Views */



}
