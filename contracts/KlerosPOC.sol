/**
 *  @title Kleros POC
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

// We'll have to remove those for tests as truffle does not support github import.
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
    RNG rng; // Random Number Generator used to draw jurors.
    uint public arbitrationFeePerJuror = 0.05 ether; // The fee which will be paid to each juror.
    uint public defaultNumberJuror = 3; // Number of draw juror unless specified otherwise.
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
        Arbitrable arbitrated;     // Contract to be arbitrated.
        uint session;              // Session the dispute was raised.
        uint appeals;              // Number of appeals.
        uint randomNumber;         // Random number drawn for the dispute to be use to draw jurors. Is 0 before the number is available.
        uint choices;              // The number of choices availables to the jurors.
        DisputeState state;        // The state of the dispute.
        Vote[][] votes;            // The votes in the form vote[appeals][voteID].
        VoteCounter[] voteCounter; // The vote counters in the form voteCounter[appeals].
        mapping (address => uint) lastSessionVote; // Last session a juror has voted on this dispute. Is 0 if he never did.
    }
    
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
        require(pinakion.transferFrom(msg.sender,this,_value));
        
        jurors[msg.sender].balance+=_value;
    }
    
    /** @dev Withdraw tokens. Note that we can't withdraw the tokens which are still atStake. Jurors can't withdraw their tokens if they have activated some during Draw and Vote.
     *  This is to prevent jurors from withdrawing tokens they could loose.
     *  @param _value The amount to withdraw.
     */
    function withdraw(uint _value) public {
        Juror juror = jurors[msg.sender];
        require(juror.atStake<=juror.balance); // Make sure that there is no more at stake than owned to avoid overflow.
        require(_value<=juror.balance-juror.atStake);
        if (juror.lastSession==session)
            require(period!=Period.Draw && period!=Period.Vote);
            
        juror.balance-=_value;
        pinakion.transfer(msg.sender,_value);
    }
    
    // **************************** //
    // *      Court functions     * //
    // **************************** //
  
    /** @dev Activate tokens in order to have chances of being drawn. Note that once tokens are activated, there is no possibility of activating more.
     *  @param _value Amount of fractions of token to activate.
     */
    function activateTokens(uint _value) onlyDuring(Period.Activation) {
        Juror juror = jurors[msg.sender];
        require(_value<=juror.balance);
        require(_value>=minActivatedToken);
        require(juror.lastSession!=session); // Verify that tokens were not already activated for this session.
        
        juror.lastSession=session;
        juror.segmentStart=segmentSize;
        segmentSize+=_value;
        juror.segmentEnd=segmentSize;
        
    }
  
  
  
    
    
    
}