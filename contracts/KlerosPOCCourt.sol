pragma solidity ^0.4.15;

import "kleros-interaction/contracts/standard/arbitration/ArbitratorCourt.sol";
import "kleros-interaction/contracts/standard/rng/RNG.sol";

import "./KlerosPOC.sol";
import "./PinakionPOC.sol";

/**
 *  @title KlerosPOCCourt
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @notice A `KlerosPOC` Court in a tree of `ArbitratorCourt`s.
 */
contract KlerosPOCCourt is ArbitratorCourt, KlerosPOC {
    /* Constructor */

    /**
     *  @notice Constructs the `KlerosPOCCourt`, forwarding all required parameters to the base contracts.
     *  @param _parentName The name of the `parent`.
     *  @param _parentAddress The address of the `parent`.
     *  @param _pinakion The address of the pinakion contract which will be used.
     *  @param _rng The address of the random number generator contract which will be used.
     *  @param _timePerPeriod The minimal time for each period.
     */
    function KlerosPOCCourt(string _parentName, Arbitrator _parentAddress, PinakionPOC _pinakion, RNG _rng, uint[5] _timePerPeriod) ArbitratorCourt(1, _parentName, _parentAddress) KlerosPOC(_pinakion, _rng, _timePerPeriod) public {}

    /* Public */

    /** @notice Appeals a ruling to the parent court.
     *  @param _disputeID The ID of the dispute to be appealed.
     *  @param _extraData Part of the standard but not used by this contract.
     */
    function appeal(uint256 _disputeID, bytes _extraData) public payable onlyDuring(Period.Appeal) {
        super.appeal(_disputeID, _extraData); // Regular appeal

        if (disputes[_disputeID].appeals > maxLocalAppeals) { // Did we max exceed local appeals?
            disputes[_disputeID].state = DisputeState.Executed; // Terminate dispute
            parent.createDispute.value(msg.value)(disputes[_disputeID].choices, _extraData); // Create dispute in `parent` court
        }
    }

    /* Public Views */

    /** @notice Computes the cost of appealing to the parent court. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _disputeID The ID of the dispute to be appealed.
     *  @param _extraData Part of the standard but not used by this contract.
     *  @return _fee The appeal cost.
     */
    function appealCost(uint256 _disputeID, bytes _extraData) public constant returns(uint256 _fee) {
        if (disputes[_disputeID].appeals < maxLocalAppeals) { // Will we stay under max local appeals?
            return super.appealCost(_disputeID, _extraData); // Regular appeal cost
        }

        return parent.arbitrationCost.value(msg.value)(_extraData); // `parent` arbitration cost
    }
}
