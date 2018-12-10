pragma solidity ^0.4.24;

import "./Kleros.sol";

 /** @title Briber
  *  @dev The contract allows to bribe the jurors of Kleros contract
 */
contract Briber {
    address owner;
    Kleros kleros;
    uint disputeID;
    uint bribe;
    uint target;
    
    // Set to true when the bribee has been paid, false otherwize.
    // On the form hasBeenPaid[_disputeID][_appeals][_voteID].
    mapping (uint => mapping (uint => mapping (uint => uint))) hasBeenPaid;
    
    /** @dev Constructor.
     *  @param _kleros The Kleros contract.
     *  @param _disputeID The dispute we are targeting.
     *  @param _bribe The bribe paid.
     *  @param _target The desired ruling of the dispute.
     *  @notice The amount of bribe is in wei
     */
    constructor(address _kleros, uint _disputeID, uint _bribe, uint _target) public payable {
        kleros = Kleros(_kleros);
        owner = msg.sender;
        disputeID = _disputeID;
        bribe = _bribe;
        target = _target;
    }
    
    /** @dev Pays the amount of bribe to the jurors that voted for target ruling. Sets hasBeenPaid to 1 when payment has been done
     */
    function settle() public {
        require(kleros.disputeStatus(disputeID) == Arbitrator.DisputeStatus.Solved, "Make sure the dispute is over.");

        (, , uint appeals, uint choices, , , ,) = kleros.disputes(disputeID);
        for (uint a = 0; a<=appeals; a++) {
            uint votesLen = 0; // Number of votes.
            for (uint c = 0; c<=choices; c++) { // Iterate for each choice of the dispute to get number of votes.
                votesLen += kleros.getVoteCount(disputeID, a, c);
            }
            for (uint v = 0; v<votesLen; v++) {
                uint voteRuling = kleros.getVoteRuling(disputeID, a, v); // Ruling of current vote.
                if (voteRuling == target) { // If the ruling is the one required by the briber.
                    address voteAccount = kleros.getVoteAccount(disputeID, a, v);
                    require(voteAccount.send(bribe), "Couldn't send the bribe");
                    hasBeenPaid[disputeID][a][v] = 1;
                }
            }
        }

    }
    
    function () public payable {} // Allow adding eth to pay the bribe.
    
}
