/**
 *  @title Kleros POC
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "../../kleros-interaction/code/contracts/standard/arbitration/Arbitrator.sol";
import "./Tokens/Token.sol";
import "../../kleros-interaction//code/contracts/standard/rng/RNG.sol";

contract KlerosPOC is Arbitrator {
    
    // **************************** //
    // *    Contract variables    * //
    // **************************** //
    
    // Variables which should not change after initialization.
    Token public pinakion;
    
    // Variables which will subject to the governance mechanism.
    RNG public rng; // Random Number Generator used to draw jurors.
    uint public arbitrationFeePerJuror = 0.05 ether; // The fee which will be paid to each juror.
    uint16 public defaultNumberJuror = 3; // Number of draw juror unless specified otherwise.
    uint public minActivatedToken = 1e18; // Minimum of tokens to be activated (in basic units).
    uint public alpha = 200; // alpha in ‱.
    uint constant ALPHA_DIVISOR = 1e4; // Amount we need to dived alpha in ‱ to get the float value of alpha.
    
    // Variables changing during day to day interaction.
    uint public session = 1; // Current session of the court.
    uint public segmentSize; // Size of the segment of activated tokens.
    
    enum Period {
        Activation, // When juror can activate their tokens and parties give evidences.
        Draw,       // When jurors are drawn at random, note that this period is fast.
        Vote,       // Where jurors can vote on disputes.
        Appeal,     // When parties can appeal the rulings.
        Execution   // When Kleros call the arbitrated contracts and where token redistribution occurs.
    }
    Period public period;
    
    struct Juror {
        uint balance;      // The amount of token the contract holds for this juror.
        uint atStake;      // Total number of tokens the juror can loose in disputes he is drawn in. Those tokens are locked.
        uint lastSession;      // Last session the tokens were activated.
        uint segmentStart; // Start of the segment of activated tokens.
        uint segmentEnd;   // End of the segment of activated tokens.
    }
    mapping (address => Juror) public jurors;
    
    struct Vote {
        address account; // The juror who casted the vote.
        uint ruling;     // The ruling which was given.
    }
    struct VoteCounter {
        uint winningChoice; // The choice which currently has the highest amount of votes. Is 0 in case of a tie.
        uint winningCount;  // The number of votes for winningChoice. Or for the choices which are tied.
        mapping (uint => uint) voteCount; // voteCount[choice] is the number of votes for choice.
    }
    enum DisputeState {
        Open,       // The dispute is opened but not outcome is available yet (this include when jurors voted but appeal is still possible).
        Resolvable, // The dispute can be resolved: Token redistribution functions can be called.
        Executable, // The arbitrated contract can be called to enforce the decision.
        Executed    // Everything has been done and the dispute can't be intercted with anymore.
    }
    struct Dispute {
        Arbitrable arbitrated;      // Contract to be arbitrated.
        uint session;               // Session the dispute was raised.
        uint appeals;               // Number of appeals.
        uint randomNumber;          // Random number drawn for the dispute to be use to draw jurors. Is 0 before the number is available.
        uint choices;               // The number of choices availables to the jurors.
        uint16 initialNumberJurors; // The initial number of jurors.
        DisputeState state;         // The state of the dispute.
        Vote[][] votes;             // The votes in the form vote[appeals][voteID].
        VoteCounter[] voteCounter;  // The vote counters in the form voteCounter[appeals].
        mapping (address => uint) lastSessionVote; // Last session a juror has voted on this dispute. Is 0 if he never did.
    }
    Dispute[] public disputes;
    
    /** @dev Constructor.
     *  @param _pinakion The address of the pinakion contract.
     */
    function KlerosPOC(Token _pinakion) public {
        pinakion=_pinakion;
    }
    
    // **************************** //
    // *         Modifiers        * //
    // **************************** //    
    modifier onlyBy(address _account) { require(msg.sender==_account); require(true); _; }
    modifier onlyDuring(Period _period) { require(period==_period); _;}
    
    // **************************** //
    // *  Functions interacting   * //
    // *  with Pinakion contract  * //
    // **************************** //
    
    /** @dev Deposit pinakions of a juror in the contract. Should be call by the pinakion contract. TRUSTED.
     *  @param _from The address making the deposit.
     *  @param _value Amount of fractions of token to deposit.
     */
    function deposit(address _from, uint _value) public onlyBy(pinakion) {
        require(pinakion.transferFrom(_from,this,_value));
        
        jurors[msg.sender].balance+=_value;
    }
    
    /** @dev Withdraw tokens. Note that we can't withdraw the tokens which are still atStake. Jurors can't withdraw their tokens if they have activated some during Draw and Vote.
     *  This is to prevent jurors from withdrawing tokens they could loose.
     *  @param _value The amount to withdraw.
     */
    function withdraw(uint _value) public {
        Juror storage juror = jurors[msg.sender];
        require(juror.atStake<=juror.balance); // Make sure that there is no more at stake than owned to avoid overflow.
        require(_value<=juror.balance-juror.atStake);
        if (juror.lastSession==session)
            require(period!=Period.Draw && period!=Period.Vote);
            
        juror.balance-=_value;
        pinakion.transfer(msg.sender,_value);
    }
    
    // **************************** //
    // *      Court functions     * //
    // *    Modifying the state   * //
    // **************************** //
  
    /** @dev Activate tokens in order to have chances of being drawn. Note that once tokens are activated, there is no possibility of activating more.
     *  @param _value Amount of fractions of token to activate.
     */
    function activateTokens(uint _value) public onlyDuring(Period.Activation) {
        Juror storage juror = jurors[msg.sender];
        require(_value<=juror.balance);
        require(_value>=minActivatedToken);
        require(juror.lastSession!=session); // Verify that tokens were not already activated for this session.
        
        juror.lastSession=session;
        juror.segmentStart=segmentSize;
        segmentSize+=_value;
        juror.segmentEnd=segmentSize;
        
    }
    
    // **************************** //
    // *      Court functions     * //
    // *     Constant and Pure    * //
    // **************************** //  
    
    /** @dev Return the amount of jurors which are or will be drawn in the dispute.
     *  The number of jurors is doubled and 1 is added at each appeal. We have proven the formula by recurrence.
     *  This avoid having a variable number of jurors which would be updated in order to save gas.
     *  @param _dispute The dispute we compute the amount of jurors.
     *  @return nbJurors The number of jurors which are drawn.
     */
    function amountJurors(Dispute storage _dispute) internal constant returns(uint nbJurors) {
        return (_dispute.initialNumberJurors+1) * 2**_dispute.appeals - 1;
    }
    
    /** @dev Must be used to prove that a juror has been draw at least minWeight times.
     *  We have to require the user to specify the draws that lead the juror to be drawn.
     *  Because doing otherwise (looping throught all draws) could consume too much gas.
     *  @param _jurorAddress Address of the juror we want to prove was drawn.
     *  @param _disputeID The ID of the dispute the juror was drawn.
     *  @param _draws The list of draws the juror was drawn. It draw numbering starts at 1 and the numbers should be increasing.
     *  Note that in most cases this list will just contain 1 number.
     */
    function hasWeightAtMin(address _jurorAddress, uint _disputeID, uint[] _draws) public constant returns(uint minWeight) {
        uint draw = 0;
        Juror storage juror = jurors[_jurorAddress];
        Dispute storage dispute = disputes[_disputeID];
        uint nbJurors = amountJurors(dispute);
        
        require(juror.lastSession==session); // Make sure that the tokens were activated for this session.
        require(dispute.session+dispute.appeals == session); // Make sure this currently a dispute.
        require(period>Period.Draw); // Make sure that it's already drawn.
        for (uint i;i<_draws.length;++i) {
            require(_draws[i]>draw); // Make sure that draws are always increasing to avoid someone inputing the same multiple times.
            draw = _draws[i];
            require(draw<=nbJurors);
            uint position = uint(keccak256(dispute.randomNumber,draw)) % segmentSize; // Random position on the segment for draw.
            require(position>=juror.segmentStart);
            require(position<juror.segmentEnd);
        }
        
        return _draws.length;
    }
    
    // **************************** //
    // *   Arbitrator functions   * //
    // *   Modifying the state    * //
    // **************************** //
    
    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID) {
        uint16 nbJurors = extraDataToNbJurors(_extraData);
        require(msg.value >= nbJurors*arbitrationFeePerJuror);
        
        disputeID = disputes.length++;
        Dispute storage dispute = disputes[disputeID];
        dispute.arbitrated = Arbitrable(msg.sender);
        if (period < Period.Draw) // If drawing did not start schedule it for the current session.
            dispute.session = session;
        else // Otherwize schedule it for the next one.
            dispute.session = session+1;
        dispute.choices = _choices;
        dispute.initialNumberJurors = nbJurors;
        dispute.votes.length++;
        dispute.voteCounter.length++;
        
        return disputeID;
    }
    
    /** @dev Appeal a ruling. Note that it has to be called before the arbitrator contract calls rule.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Can be used to give extra info on the appeal.
     */
    function appeal(uint _disputeID, bytes _extraData) public payable {
        Dispute storage dispute = disputes[_disputeID];
        require(msg.value >= appealCost(_disputeID,_extraData));
        require(period==Period.Appeal);
        require(dispute.session+dispute.appeals == session); // Dispute of the current session.
        require(dispute.state==DisputeState.Open);
        
        dispute.appeals++;
        dispute.randomNumber=0;
        dispute.votes.length++;
        dispute.voteCounter.length++;
        
    }
    
    // **************************** //
    // *   Arbitrator functions   * //
    // *    Constant and pure     * //
    // **************************** //
    
    /** @dev Compute the cost of arbitration. It is recommended not to increase it often, as it can be higly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) public constant returns(uint fee) {
        return extraDataToNbJurors(_extraData) * arbitrationFeePerJuror;
    }
    
    /** @dev Compute the cost of appeal. It is recommended not to increase it often, as it can be higly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Is not used there.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) public constant returns(uint fee) {
        return (2*amountJurors(disputes[_disputeID]) + 1) * arbitrationFeePerJuror;
    }
    
    /** @dev Compute the amount of jurors to be drawn.
     *  @param _extraData Null for the default number. Other first 16 bytes will be used to return the number of jurors.
     *  Note that it does not check that the number of jurors is odd, but users are advised to choose a odd number of jurors.
     */
    function extraDataToNbJurors(bytes _extraData) internal constant returns(uint16 nbJurors) {
        if (_extraData.length<2)
            return defaultNumberJuror;
        else
            return (uint16(_extraData[0])<<8) + uint16(_extraData[1]);
    }
    
}