/**
 *  @title KlerosPOC
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  This code implements a simple version of Kleros.
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "minimetoken/contracts/TokenController.sol";

import "../Kleros.sol";

contract KlerosPOC is Kleros, TokenController {
    /** @dev Constructor for KlerosPOC passing all arguments to base Kleros contract.
     *  @param _pinakion The address of the pinakion contract.
     *  @param _rng The random number generator which will be used.
     *  @param _timePerPeriod The minimal time for each period.
     *  @param _governor Address of the governor contract.
     */
    function KlerosPOC(Pinakion _pinakion, RNG _rng, uint[5] _timePerPeriod, address _governor) Kleros(_pinakion, _rng, _timePerPeriod, _governor) public {}

    // **************************** //
    // *    Functions required    * //
    // *    for TokenController   * //
    // **************************** //

    /** @notice Called when `_owner` sends ether to the Pinakion contract
     *  @param _owner The address that sent the ether to create tokens
     *  @return True if the ether is accepted, false if it throws
     */
    function proxyPayment(address _owner) public payable returns(bool) {
        return false; // don't allow any ether transfers to Pinakion contract
    }

    /** @notice Notifies the controller about a token transfer allowing the controller to react if desired
     *  @param _from The origin of the transfer
     *  @param _to The destination of the transfer
     *  @param _amount The amount of the transfer
     *  @return False if the controller does not authorize the transfer
     */
    function onTransfer(address _from, address _to, uint _amount) public returns(bool) {
        return true; // allow all transfers
    }

    /** @notice Notifies the controller about an approval allowing the controller to react if desired
     *  @param _owner The address that calls `approve()`
     *  @param _spender The spender in the `approve()` call
     *  @param _amount The amount in the `approve()` call
     *  @return False if the controller does not authorize the approval
     */
    function onApprove(address _owner, address _spender, uint _amount) public returns(bool) {
        return true; // allow all approvals
    }

    // **************************** //
    // *    Functions specific    * //
    // *          to POC          * //
    // **************************** //

    /** @dev Give Pinakions at the rate 1 ETH = 1 PNK.
     *  Note that in the real Kleros, the token supply will be fixed but for the proof of concept, we prefer to allow users to get some easily to try it.
     */
    function buyPinakion() public payable {
        Juror storage juror = jurors[msg.sender];
        juror.balance+=msg.value;
        pinakion.generateTokens(this,msg.value);
    }
}
