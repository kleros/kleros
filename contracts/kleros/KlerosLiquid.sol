pragma solidity ^0.4.24;

import "kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";
import "kleros-interaction/contracts/standard/arbitration/Arbitrable.sol";

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
        // The appeal after the one that reaches this number of jurors will go to the parent court if any, otherwise, no more appeals are possible
        uint jurorsForJump;
        uint[4] timesPerPeriod; // The time allotted to each dispute period in the form `timesPerPeriod[period]`
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
        Vote[][] votes; // The votes in the form `votes[appeal][voteID]`
        VoteCounter[] voteCounters; // The vote counters in the form `voteCounters[appeal]`
        uint[] totalJurorFees; // The total juror fees paid in the form `totalJurorFees[appeal]`
        uint[] appealRepartitions; // The last repartitioned voteIDs in the form `appealRepartitions[appeal]`
    }

    /* Events */

    /** @dev To be raised when a voter is drawn.
     *  @param disputeID The ID of the dispute.
     *  @param arbitrable The arbitrable contract that is ruled by the dispute.
     *  @param _address The drawn address.
     */
    event Draw(uint indexed disputeID, Arbitrable indexed arbitrable, address indexed _address);

    /* Storage */



    /* Modifiers */



    /* Constructor */



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
