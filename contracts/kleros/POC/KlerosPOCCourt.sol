pragma solidity ^0.4.15;

import "kleros-interaction/contracts/standard/rng/RNG.sol";
import { MiniMeTokenERC20 as Pinakion } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

import "../KlerosCourt.sol";

import "./KlerosPOC.sol";

/**
 *  @title KlerosPOCCourt
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A `KlerosPOC` Court in a tree of `ArbitratorCourt`s.
 */
contract KlerosPOCCourt is KlerosCourt, KlerosPOC {
    /* Constructor */

    /**
     *  @notice Constructs the `KlerosPOCCourt`, forwarding all required parameters to the base contracts.
     *  @param _parentName The name of the `parent`.
     *  @param _parentAddress The address of the `parent`.
     *  @param _pinakion The address of the pinakion contract which will be used.
     *  @param _rng The address of the random number generator contract which will be used.
     *  @param _timePerPeriod The minimal time for each period.
     *  @param _governor Address of the governor contract.
     */
    function KlerosPOCCourt(string _parentName, Arbitrator _parentAddress, Pinakion _pinakion, RNG _rng, uint[5] _timePerPeriod, address _governor) KlerosCourt(_parentName, _parentAddress, _pinakion, _rng, _timePerPeriod, _governor) KlerosPOC(_pinakion, _rng, _timePerPeriod, _governor) public {}
}
