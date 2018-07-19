pragma solidity ^0.4.15;

import "kleros-interaction/contracts/standard/rng/RNG.sol";
import { MiniMeTokenERC20 as Pinakion } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

import "./KlerosPOC.sol";
import "../KlerosCourt.sol";

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
    function KlerosPOCCourt(string _parentName, Arbitrator _parentAddress, Pinakion _pinakion, RNG _rng, uint[5] _timePerPeriod, address _governor) ArbitratorCourt(1, _parentName, _parentAddress) KlerosPOC(_pinakion, _rng, _timePerPeriod, _governor) public {}

    /* Public */

    /** @notice Appeals a ruling to the parent court.
     *  @param _disputeID The ID of the dispute to be appealed.
     *  @param _extraData Part of the standard but not used by this contract.
     */
    function appeal(uint256 _disputeID, bytes _extraData) public payable onlyDuring(Period.Appeal) {
        if (disputes[_disputeID].appeals < maxAppeals) { // Will we stay under max local appeals?
            super.appeal(_disputeID, _extraData); // Regular appeal
        } else { // Appeal to `parent`
            // Checks
            require(disputes[_disputeID].session + disputes[_disputeID].appeals == session); // Dispute of the current session

            // Effects
            disputes[_disputeID].appeals++;
            disputes[_disputeID].votes.length++;
            disputes[_disputeID].voteCounter.length++;
            disputes[_disputeID].state = DisputeState.Executed; // Terminate dispute

            // Interactions
            Arbitrator.appeal(_disputeID, _extraData); // Fire appeal event
            parent._address.createDispute.value(msg.value)(disputes[_disputeID].choices, _extraData); // Create dispute in `parent` court
        }
    }

    /* Public Views */

    /** @notice Computes the cost of appealing to the parent court. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _disputeID The ID of the dispute to be appealed.
     *  @param _extraData Part of the standard but not used by this contract.
     *  @return _fee The appeal cost.
     */
    function appealCost(uint256 _disputeID, bytes _extraData) public constant returns(uint256 _fee) {
        if (disputes[_disputeID].appeals < maxAppeals) { // Will we stay under max local appeals?
            return super.appealCost(_disputeID, _extraData); // Regular appeal cost
        } else {
            if (parent._address == address(0) && bytes(parent.name).length == 0) return NON_PAYABLE_AMOUNT;
            return parent._address.arbitrationCost(_extraData); // `parent` arbitration cost
        }

    }
}
