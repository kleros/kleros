pragma solidity ^0.4.24;

import "kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";

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



    /* Events */



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
