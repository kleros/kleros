/**
 *  @title Governance
 *  @author Ferit Tunçer - <ferit@cryptolab.net>
 *  This contract implements the governance mechanism of Kleros Athena release.
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.24;

import "kleros-interaction/contracts/standard/permission/ArbitrablePermissionList.sol";
import "kleros-interaction/contracts/standard/arbitration/CentralizedArbitrator.sol"; // I need this contract to be deployed for tests, Truffle issue.
import { MiniMeTokenERC20, TokenController } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

contract Governance is TokenController{

    MiniMeTokenERC20 public pinakion;
    TokenController public tokenController;
    ArbitrablePermissionList public proposalList;

    uint public proposalQuorum;

    uint public quorumDivideTime;
    uint public lastTimeQuorumReached;

    uint public votingTime;
    uint public currentVotingTime;

    address public constant SUPPORT_DEPOSIT = 0x707574546F566F74650000000000000000000000; // Address is a message in hex: putToVote - When this address reaches quorum proposal gets put to vote.
    address public constant APPROVAL_DEPOSIT =  0x617070726f76616c000000000000000000000000; // Address is a message in hex: approval - This address represents yes votes.
    address public constant REJECTION_DEPOSIT = 0x72656a656374696F6E0000000000000000000000; // Address is a message in hex: rejection - This address represents no votes.

    enum ProposalState {
        New,
        PutToSupport,
        PutToVote,
        Decided,
        Executed
    }

    struct Proposal {
        address destination; // The governed contract.
        uint amount; // The amount of ETH to send (in most cases it should be 0).
        bytes data; // The data (similar to a multisig mechanism).
        string descriptionURI; // URI to a natural language description of the proposal. Also used as ID in mappings.
        bytes32 descriptionHash; // Hash of the description.
        string argumentsURI; // URI to arguments for the proposal.
        bytes32 argumentsHash; // Hash of the arguments.
        ProposalState state; // State of proposal.
        uint whenPutToVote; // Records the time when a proposal put to vote to be able to calculate voting period.
        MiniMeTokenERC20 quorumToken; // The token that will be used for quorum.
        MiniMeTokenERC20 voteToken; // The token that will be used for actual proposal voting.
        bool approved; // Outcome of voting.
    }

    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => uint) public quorumRequirement; // The quorum requirement that is constant during a proposals lifecycle.


    constructor (uint _proposalQuorum, uint _quorumDivideTime, uint _votingTime, ArbitrablePermissionList _arbitrablePermissionList, MiniMeTokenERC20 _pinakion, TokenController _tokenController) public {
        lastTimeQuorumReached = block.timestamp;

        proposalList = _arbitrablePermissionList;
        pinakion = _pinakion;
        tokenController = _tokenController;

        proposalQuorum = _proposalQuorum;

        quorumDivideTime = _quorumDivideTime;
        votingTime = _votingTime;
    }


    // ****************************** //
    // *          Modifiers         * //
    // ****************************** //


    modifier onlyWhenProposalInStateOf(bytes32 _id, ProposalState _proposalState){
        require(proposals[_id].state == _proposalState, string(abi.encodePacked("Proposal must be in state: ", _proposalState)));
        _;
    }

    modifier onlyItself() {
        require(msg.sender == address(this), "Caller must be the contract itself.");
        _;
    }


    // ****************************** //
    // *           Events           * //
    // ****************************** //

    event ProposalCreated(bytes32 indexed _id, address _destination);

    event ProposalRequestedToRegister(bytes32 indexed _id);

    event ProposalPutToSupport(bytes32 indexed _id);

    event ProposalPutToVote(bytes32 indexed _id);

    event ProposalDecided(bytes32 indexed _id, bool _approved);

    event ProposalExecuted(bytes32 indexed _id);


    // ****************************** //
    // *    Governance Mechanism    * //
    // ****************************** //

    /** @dev Creates a proposal and requests registering to proposalList.
     *  @param _id ID of the proposalList.
     *  @param _destination Destination contract of the execution.
     *  @param _amount Value of the execution.
     *  @param _data Data of the execution.
     *  @param _descriptionURI URI of the description of the proposal.
     *  @param _descriptionHash Hash of the description content.
     *  @param _argumentsURI URI of the arguments of the proposal.
     *  @param _argumentsHash Hash of the arguments content.
     */
    function createAndRegisterProposal(bytes32 _id, address _destination, uint _amount, bytes _data, string _descriptionURI, bytes32 _descriptionHash, string _argumentsURI, bytes32 _argumentsHash) public payable onlyWhenProposalInStateOf(_id, ProposalState.New)  {
        require(proposals[_id].destination == address(0), "There must not be a proposal with given id already.");

        proposals[_id].destination = _destination;
        proposals[_id].amount = _amount;
        proposals[_id].data = _data;
        proposals[_id].descriptionURI = _descriptionURI;
        proposals[_id].descriptionHash = _descriptionHash;
        proposals[_id].argumentsURI = _argumentsURI;
        proposals[_id].argumentsHash = _argumentsHash;

        quorumRequirement[_id] = proposalQuorum;

        emit ProposalCreated(_id, _destination);

        proposalList.requestRegistration.value(msg.value)(_id);
        emit ProposalRequestedToRegister(_id);
    }


    /** @dev Put proposal to support voting only when a new proposal is permitted.
     *  @param _id ID of a proposal.
     */
    function putProposalToSupport(bytes32 _id) public onlyWhenProposalInStateOf(_id, ProposalState.New) {
        require(proposalList.isPermitted(_id), "Proposal must be permitted in the proposal list.");

        Proposal storage proposal = proposals[_id];

        address cloneToken = pinakion.createCloneToken({_cloneTokenName: "Quorum Token", _cloneDecimalUnits: pinakion.decimals(), _cloneTokenSymbol: "QUORUM", _snapshotBlock: block.number, _transfersEnabled: true});
        proposal.quorumToken = MiniMeTokenERC20(cloneToken);

        proposal.state = ProposalState.PutToSupport;

        emit ProposalPutToSupport(_id);
    }


    /** @dev Calculate and return required quorum for a given proposal.
     *  @param _id ID of a proposal.
     */
    function getRequiredQuorum(bytes32 _id) public view onlyWhenProposalInStateOf(_id, ProposalState.PutToSupport) returns (uint effectiveQuorum){
        uint numberOfDividePeriodsPassed = (block.timestamp - lastTimeQuorumReached) / quorumDivideTime;
        effectiveQuorum = quorumRequirement[_id] * proposals[_id].quorumToken.totalSupply() / (2 ** numberOfDividePeriodsPassed) / 100;
    }


    /** @dev Put given proposal to vote.
     *  @param _id ID of a proposal.
     */
    function putProposalToVote(bytes32 _id) public onlyWhenProposalInStateOf(_id, ProposalState.PutToSupport) {
        require(proposals[_id].quorumToken.balanceOf(SUPPORT_DEPOSIT) >= getRequiredQuorum(_id), "Proposal must to have quorum.");

        Proposal storage proposal = proposals[_id];

        proposal.whenPutToVote = block.timestamp;

        address cloneToken = pinakion.createCloneToken({_cloneTokenName: "Vote Token", _cloneDecimalUnits: pinakion.decimals(), _cloneTokenSymbol: "VOTE", _snapshotBlock: block.number, _transfersEnabled: true});
        proposal.voteToken = MiniMeTokenERC20(cloneToken);

        proposal.state = ProposalState.PutToVote;

        emit ProposalPutToVote(_id);

        lastTimeQuorumReached = block.timestamp; // Necessary when calculating required quorum as it is halved periodically.
        currentVotingTime = votingTime; // Update allowed voting time, which will be constant during new quorum phase.
    }


    /** @dev Ends a voting, moves proposal to decided state, sets the decision.
     *  @param _id ID of a proposal.
     */
    function finalizeVoting(bytes32 _id) onlyWhenProposalInStateOf(_id, ProposalState.PutToVote) public  {
        require(now - proposals[_id].whenPutToVote >= currentVotingTime, "Voting period must be ended.");

        proposals[_id].state = ProposalState.Decided;
        proposals[_id].approved = proposals[_id].voteToken.balanceOf(APPROVAL_DEPOSIT) > proposals[_id].voteToken.balanceOf(REJECTION_DEPOSIT);

        emit ProposalDecided(_id, proposals[_id].approved);
    }


    /** @dev General purpose call function for executing a proposal UNTRUSTED.
     *  @param _id ID of a proposal.
     */
    function executeProposal(bytes32 _id) onlyWhenProposalInStateOf(_id, ProposalState.Decided) public {
        Proposal storage proposal = proposals[_id];

        require(proposal.approved, "Proposal must be approved.");

        require(proposal.destination.call.value(proposal.amount)(proposal.data), "Proposal execution failed!"); // solium-disable-line security/no-call-value
        proposal.state = ProposalState.Executed;
        emit ProposalExecuted(_id);
    }


    // ***************** //
    // *    Setters    * //
    // ***************** //

    /** @dev Setter for proposalQuorum.
     *  @param _proposalQuorum Value to be set.
     */
    function setProposalQuorum(uint _proposalQuorum) public onlyItself {
        proposalQuorum = _proposalQuorum;
    }


    /** @dev Setter for votingTime.
     *  @param _votingTime Value to be set.
     */
    function setVotingTime(uint _votingTime) public onlyItself {
        votingTime = _votingTime;
    }


    /** @dev Setter for quorumDivideTime.
     *  @param _quorumDivideTime Value to be set.
     */
    function setQuorumDivideTime(uint _quorumDivideTime) public onlyItself {
        quorumDivideTime = _quorumDivideTime;
    }


    // ************************** //
    // *    Token Controller    * //
    // ************************** //

    /// @notice Called when `_owner` sends ether to the MiniMe Token contract.
    /// @param _owner The address that sent the ether to create tokens.
    /// @return True if the ether is accepted, false if it throws.
    function proxyPayment(address _owner) public payable returns(bool){
        return true;
    }

    /// @notice Notifies the controller about a token transfer allowing the controller to react if desired.
    /// @param _from The origin of the transfer.
    /// @param _to The destination of the transfer.
    /// @param _amount The amount of the transfer.
    /// @return False if the controller does not authorize the transfer.
    function onTransfer(address _from, address _to, uint _amount) public returns(bool){
        return true;
    }

    /// @notice Notifies the controller about an approval allowing the controller to react if desired.
    /// @param _owner The address that calls `approve()`.
    /// @param _spender The spender in the `approve()` call.
    /// @param _amount The amount in the `approve()` call.
    /// @return False if the controller does not authorize the approval.
    function onApprove(address _owner, address _spender, uint _amount) public returns(bool){
        return true;
    }
}
