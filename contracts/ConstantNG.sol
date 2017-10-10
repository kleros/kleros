/**
 *  @title Constant Number Generator
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  @dev A Random Number Generator which always return the same number. Usefull in order to make tests.
 */

import "kleros-interaction/contracts/standard/rng/RNG.sol";

pragma solidity ^0.4.15;
 
 contract ConstantNG is RNG{
    
    uint public number;
    
    /** @dev Constructor.
     *  @param _number The number to always return.
     */
    function ConstantNG(uint _number) {
        number = _number;
    }
    
    /** @dev Contribute to the reward of a random number. All the ETH will be lost forever.
     *  @param _block Block the random number is linked to.
     */
    function contribute(uint _block) public payable {}

    
    /** @dev Get the "random number" (which is always the same).
     *  @param _block Block the random number is linked to.
     *  @return RN Random Number. If the number is not ready or has not been required 0 instead.
     */
    function getRN(uint _block) public returns (uint RN) {
        return number;
    }
    
    
 }

