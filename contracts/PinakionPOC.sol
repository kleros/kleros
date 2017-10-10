 /**
 *  @title Pinakion POC
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;
 
import "zeppelin-solidity/contracts/token/MintableToken.sol";
import "./KlerosPOC.sol";
 
contract PinakionPOC is MintableToken {
    KlerosPOC public kleros;
    
    /** @dev Deposit pinakions in the Kleros contract. TRUSTED.
     *  @param _value Amount of fractions of token to deposit.
     */
    function deposit(uint _value) public {
        approve(kleros,_value);
        kleros.deposit(msg.sender,_value);
    }
    
    /** @dev Set kleros address.
     *  @param _kleros The address of the Kleros contract.
     */
    function setKleros(KlerosPOC _kleros) public onlyOwner {
        kleros=_kleros;
    }
    
}