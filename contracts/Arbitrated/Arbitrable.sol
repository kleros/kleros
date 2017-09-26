pragma solidity ^0.4.6;

import "../Court.sol";

// TODO Refactor all the time logic of those contracts.

/*
Virtual Contract to be artibrated by the court.
*/
contract Arbitrable {
    Court court;
    function Arbitrable(Court _court){
        court=_court;
    }

    modifier onlyCourt {if (msg.sender!=address(court)) throw; _;}

    /** Function the court will call to execute ruling A.
     *  In most cases, this function should have the modifier onlyCourt.
     */
    function ruleA(uint256 disputeID);

    /** Function the court will call to execute ruling B.
     *  In most cases, this function should have the modifier onlyCourt.
     */
    function ruleB(uint256 disputeID);

}
