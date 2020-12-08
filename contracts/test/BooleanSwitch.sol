pragma solidity ^0.4.26;

contract BooleanSwitch {
    bool public on;
    
    function setSwitch(bool _on) public {
        on = _on;
    }
}
