/**
 *  @title Governance
 *  @author Ferit Tunçer - <ferit@cryptolab.net>
 *  This contract implements the governance mechanism of Kleros Athena release.
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.24;

import "kleros-interaction/contracts/standard/permission/ArbitrablePermissionList.sol";
import "kleros-interaction/contracts/standard/arbitration/CentralizedArbitrator.sol"; // I need this contract to be deployed for tests, Truffle issue
import { ApproveAndCallFallBack, MiniMeToken, MiniMeTokenFactory, TokenController } from "minimetoken/contracts/MiniMeToken.sol";
import { MiniMeTokenERC20 as Pinakion } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

contract Governance {

    Pinakion public pinakion;
    TokenController public tokenController;
    ArbitrablePermissionList public proposalList;

    uint public proposalQuorum;
    uint public currentProposalQuorum;

    uint public quorumDivideTime;
    uint public lastTimeQuorumReached;

    uint public votingTime;
    uint public currentVotingTime;

    string constant voteTokenName = "Vote Token";
    string constant quorumTokenName = "Quorum Token";
    string constant voteTokenSymbol = "VOTE";
    string constant quorumTokenSymbol = "QUORUM";
    uint8 constant DECIMALS = 18;
    address public constant supportDeposit = 0x707574546F566F74650000000000000000000000; // When this address reaches quorum proposal gets put to vote.
    address public constant approvalDeposit =  0x617070726f76616c000000000000000000000000; // This address represents yes votes.
    address public constant rejectionDeposit = 0x72656a656374696F6E0000000000000000000000; // This address represents no votes.

    enum ProposalState {
        New,
        PutToSupport,
        PutToVote,
        Decided
    }

    struct Proposal {
        address destination; // The governed contract.
        uint amount; // The amount of ETH to send (in most cases it should be 0).
        bytes data; // The data (similar to a multisig mechanism).
        string uriDescription; // URI to a natural language description of the proposal. Also used as ID in mappings.
        bytes32 descriptionHash; // Hash of the description.
        string uriArguments; // URI to arguments for the proposal.
        bytes32 argumentsHash; // Hash of the arguments.
        ProposalState state; // State of proposal.
        uint whenPutToVote; // Records the time when a proposal put to vote to be able to calculate voting period.
        MiniMeToken quorumToken; // The token that will be used for quorum.
        MiniMeToken voteToken; // The token that will be used for actual proposal voting.
        bool approved; // Outcome of voting.
    }

    mapping(bytes32 => Proposal) public proposals;


    constructor (uint _proposalQuorum, uint _quorumDivideTime, uint _votingTime, ArbitrablePermissionList _arbitrablePermissionList, Pinakion _pinakion, TokenController _tokenController) public {
        lastTimeQuorumReached = block.timestamp;

        proposalList = _arbitrablePermissionList;
        pinakion = _pinakion;
        tokenController = _tokenController;

        proposalQuorum = _proposalQuorum;
        currentProposalQuorum = proposalQuorum;

        quorumDivideTime = _quorumDivideTime;
        votingTime = _votingTime;
    }


    // ****************************** //
    // *          Modifiers         * //
    // ****************************** //

    modifier onlyWhenProposalIsNew(bytes32 _id) {
        require(proposals[_id].state == ProposalState.New, "Only when proposal in New state.");
        _;
    }

    modifier onlyWhenProposalPutToSupport(bytes32 _id) {
        require(proposals[_id].state == ProposalState.PutToSupport, "Only when proposal in PutToSupport state.");
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

    /** @dev Creates a proposal, adds to proposals and requests registering to proposalList
     *  @param _id ID of the proposalList
     *  @param _destination Destination contract of the execution
     *  @param _amount Value of the execution
     *  @param _data Data of the execution
     *  @param _uriDescription URI of the description of the proposal
     *  @param _uriArguments URI of the arguments of the proposal
     */
    function createAndRegisterProposal(bytes32 _id, address _destination, uint _amount, bytes _data, string _uriDescription, string _uriArguments) public {
        require(proposals[_id].destination == address(0), "There is already a proposal with this id");

        proposals[_id].destination = _destination;
        proposals[_id].amount = _amount;
        proposals[_id].data = _data;
        proposals[_id].uriDescription = _uriDescription;
        proposals[_id].uriArguments = _uriArguments;

        proposals[_id].descriptionHash = keccak256(proposals[_id].uriDescription);
        proposals[_id].argumentsHash = keccak256(proposals[_id].uriArguments);

        emit ProposalCreated(_id, _destination);

        requestRegisteringProposal(_id);
    }


    /** @dev Request registering a proposal to the proposal list
     *  @param _id ID of a proposal
     */
    function requestRegisteringProposal(bytes32 _id) public payable onlyWhenProposalIsNew(_id) {
        proposalList.requestRegistration.value(msg.value)(_id);
        emit ProposalRequestedToRegister(_id);
    }


    /** @dev Put proposal to support voting only when a new proposal is permitted.
     *  @param _id ID of a proposal
     */
    function putProposalToSupport(bytes32 _id) public onlyWhenProposalIsNew(_id) {
        require(proposalList.isPermitted(_id), "Only when proposal is permitted.");

        Proposal storage proposal = proposals[_id];

        address cloneToken = pinakion.createCloneToken({_cloneTokenName: quorumTokenName, _cloneDecimalUnits: DECIMALS, _cloneTokenSymbol: quorumTokenSymbol, _snapshotBlock: block.number, _transfersEnabled: true});
        proposal.quorumToken = MiniMeToken(cloneToken);
        proposal.quorumToken.changeController(tokenController);

        proposal.state = ProposalState.PutToSupport;

        emit ProposalPutToSupport(_id);
    }


    /** @dev Calculate and return required quorum for a given proposal.
     *  @param _id ID of a proposal
     */
    function getRequiredQuorum(bytes32 _id) public view onlyWhenProposalPutToSupport(_id) returns (uint effectiveQuorum){
        uint numberOfDividePeriodsPassed = (block.timestamp - lastTimeQuorumReached) / quorumDivideTime;
        effectiveQuorum = currentProposalQuorum * proposals[_id].quorumToken.totalSupply() / (2 ** numberOfDividePeriodsPassed) / 100;
    }


    /** @dev Put given proposal to vote.
     *  @param _id ID of a proposal
     */
    function putProposalToVote(bytes32 _id) public onlyWhenProposalPutToSupport(_id) {
        require(proposals[_id].quorumToken.balanceOf(supportDeposit) >= getRequiredQuorum(_id), "Only when propsal has quorum.");

        Proposal storage proposal = proposals[_id];

        proposal.whenPutToVote = block.timestamp;

        address cloneToken = pinakion.createCloneToken({_cloneTokenName: voteTokenName, _cloneDecimalUnits: DECIMALS, _cloneTokenSymbol: voteTokenSymbol, _snapshotBlock: block.number, _transfersEnabled: true});
        proposal.voteToken = MiniMeToken(cloneToken);
        proposal.voteToken.changeController(tokenController);

        proposal.state = ProposalState.PutToVote;

        emit ProposalPutToVote(_id);

        lastTimeQuorumReached = block.timestamp; // Necessary when calculating required quorum as it is halved periodically.
        currentProposalQuorum = proposalQuorum; // Update required quorum percent, which will be constant during new quorum phase.
        currentVotingTime = votingTime; // Update allowed voting time, which will be constant during new quorum phase.
    }


    /** @dev Ends a voting, moves proposal to decided state, sets the decision
     *  @param _id ID of a proposal
     */
    function finalizeVoting(bytes32 _id) public  {
        require(proposals[_id].state == ProposalState.PutToVote, "Only when proposal in PutToVote state.");
        require(now - proposals[_id].whenPutToVote >= currentVotingTime, "Only when voting period passed.");

        proposals[_id].state = ProposalState.Decided;
        proposals[_id].approved = proposals[_id].voteToken.balanceOf(approvalDeposit) > proposals[_id].voteToken.balanceOf(rejectionDeposit);

        emit ProposalDecided(_id, proposals[_id].approved);
    }


    /** @dev General purpose call function for executing a proposal UNTRUSTED
     *  @param _id ID of a proposal
     */
    function executeProposal(bytes32 _id) public {
        require(proposals[_id].state == ProposalState.Decided, "Only when proposal in Decided state.");
        require(proposals[_id].approved, "Only when proposal is approved.");

        Proposal storage proposal = proposals[_id];

        proposal.destination.call.value(proposal.amount)(proposal.data); // solium-disable-line security/no-call-value

        emit ProposalExecuted(_id);
    }

    // ***************** //
    // *    Setters    * //
    // ***************** //

    /** @dev Setter for proposalQuorum
     *  @param _proposalQuorum Value to be set.
     */
    function setProposalQuorum(uint _proposalQuorum) internal {
        proposalQuorum = _proposalQuorum;
    }


    /** @dev Setter for votingTime
     *  @param _votingTime Value to be set.
     */
    function setVotingTime(uint _votingTime) internal {
        votingTime = _votingTime;
    }


    /** @dev Setter for quorumDivideTime
     *  @param _quorumDivideTime Value to be set.
     */
    function setQuorumDivideTime(uint _quorumDivideTime) internal {
        quorumDivideTime = _quorumDivideTime;
    }
}
