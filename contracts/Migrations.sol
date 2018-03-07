pragma solidity ^0.4.4;

import "kleros-interaction/contracts/standard/arbitration/ArbitrableTransaction.sol";
import "kleros-interaction/contracts/standard/rng/ConstantNG.sol";

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  modifier isOwner() {
    if (msg.sender == owner) _;
  }

  function Migrations() public {
    owner = msg.sender;
  }

  function setCompleted(uint completed) public isOwner {
    last_completed_migration = completed;
  }

  function upgrade(address newAddress) public isOwner {
    Migrations upgraded = Migrations(newAddress);
    upgraded.setCompleted(last_completed_migration);
  }
}
