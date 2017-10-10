/**
 *  @title Kleros POC
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";
import "./PinakionPOC.sol";
import "kleros-interaction/contracts/standard/rng/RNG.sol";

contract KlerosPOC is Arbitrator {
    
    // **************************** //
    // *    Contract variables    * //
    // **************************** //
    
    // Variables which should not change after initialization.
    PinakionPOC public pinakion;
    
    // Variables which will subject to the governance mechanism.
    // Note they will only be able to be changed during the activation period (because a session assumes they don't change after it).
    RNG public rng; // Random Number Generator used to draw jurors.
    uint public arbitrationFeePerJuror = 0.05 ether; // The fee which will be paid to each juror.
    uint16 public defaultNumberJuror = 3; // Number of draw juror unless specified otherwise.
    uint public minActivatedToken = 0.1 * 1e18; // Minimum of tokens to be activated (in basic units).
    uint[5] public timePerPeriod; // The minimum time each period lasts.
    uint public alpha = 200; // alpha in ‱.
    uint constant ALPHA_DIVISOR = 1e4; // Amount we need to dived alpha in ‱ to get the float value of alpha.
    
    // Variables changing during day to day interaction.
    uint public session = 1;      // Current session of the court.
    uint public lastPeriodChange; // The last time time we changed of period.
    uint public segmentSize;      // Size of the segment of activated tokens.
    uint public rnBlock;          // The block linked with the RN which is requested.
    uint public randomNumber;     // Random number of the session.
    
    enum Period {
        Activation, // When juror can activate their tokens and parties give evidences.
        Draw,       // When jurors are drawn at random, note that this period is fast.
        Vote,       // Where jurors can vote on disputes.
        Appeal,     // When parties can appeal the rulings.
        Execution   // When where token redistribution occurs and Kleros call the arbitrated contracts.
    }
    Period public period;
    
    struct Juror {
        uint balance;      // The amount of token the contract holds for this juror.
        uint atStake;      // Total number of tokens the juror can loose in disputes he is drawn in. Those tokens are locked. We always have atStake<=balance.
        uint lastSession;  // Last session the tokens were activated.
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
        Resolving,  // The token repartition has started. Note that if it's done in just one call, this state is skipped.
        Executable, // The arbitrated contract can be called to enforce the decision.
        Executed    // Everything has been done and the dispute can't be intercted with anymore.
    }
    struct Dispute {
        Arbitrable arbitrated;      // Contract to be arbitrated.
        uint session;               // Session the dispute was raised.
        uint appeals;               // Number of appeals.
        uint choices;               // The number of choices availables to the jurors.
        uint16 initialNumberJurors; // The initial number of jurors.
        DisputeState state;         // The state of the dispute.
        Vote[][] votes;             // The votes in the form vote[appeals][voteID].
        VoteCounter[] voteCounter;  // The vote counters in the form voteCounter[appeals].
        mapping (address => uint) lastSessionVote; // Last session a juror has voted on this dispute. Is 0 if he never did.
    }
    Dispute[] public disputes;
    
    // **************************** //
    // *          Events          * //
    // **************************** //
    
    /** @dev Emmited when we pass to a new period.
     *  @param _period The new period.
     */
    event newPeriod(Period _period);
    
    // **************************** //
    // *         Modifiers        * //
    // **************************** //    
    modifier onlyBy(address _account) { require(msg.sender==_account); require(true); _; }
    modifier onlyDuring(Period _period) { require(period==_period); _;}
    
    
    
    /** @dev Constructor.
     *  @param _pinakion The address of the pinakion contract.
     *  @param _rng The random number generator which will be used.
     *  @param _timePerPeriod The minimal time for each period.
     */
    function KlerosPOC(PinakionPOC _pinakion, RNG _rng, uint[5] _timePerPeriod) public {
        pinakion=_pinakion;
        rng=_rng;
        lastPeriodChange=now;
        timePerPeriod=_timePerPeriod;
    }
    
    
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
        
        jurors[_from].balance+=_value;
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
        require(pinakion.transfer(msg.sender,_value));
    }
    
    /** @dev Give Pinakions at the rate 1 ETH = 1 PNK.
     *  Note that in the real Kleros, the token supply will be fixed but for the proof of concept, we prefer to allow users to get some easily to try it.
     */
    function buyPinakion() public payable {
        Juror storage juror = jurors[msg.sender];
        juror.balance+=msg.value;
        pinakion.mint(this,msg.value);
    }
    
    // **************************** //
    // *      Court functions     * //
    // *    Modifying the state   * //
    // **************************** //
    
    /** @dev To call to go to a new period. TRUSTED.
     */
    function passPeriod() public {
        require(now-lastPeriodChange>=timePerPeriod[uint8(period)]);
        
        if (period==Period.Activation) {
            rnBlock=block.number+1;
            rng.requestRN(rnBlock);
            period=Period.Draw;
        } else if (period==Period.Draw) {
            randomNumber=rng.getUncorrelatedRN(rnBlock);
            require(randomNumber!=0);
            period=Period.Vote;
        } else if (period==Period.Vote) {
            period=Period.Appeal;
        } else if (period==Period.Appeal) {
            period=Period.Execution;
        } else if (period==Period.Execution) {
            period=Period.Activation;
            ++session;
            segmentSize=0;
            rnBlock=0;
            randomNumber=0;
        }
        
        
        lastPeriodChange=now;
        newPeriod(period);
    }
  
  
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
    
    /** @dev Vote a ruling. Juror must input the draw ID he was drawn.
     *  @param _disputeID The ID of the dispute the juror was drawn.
     *  @param _ruling The ruling given.
     *  @param _draws The list of draws the juror was drawn. It draw numbering starts at 1 and the numbers should be increasing.
     */
    function voteRuling(uint _disputeID, uint _ruling, uint[] _draws) public onlyDuring(Period.Vote) {
        Dispute storage dispute = disputes[_disputeID];
        Juror storage juror = jurors[msg.sender];
        VoteCounter storage voteCounter = dispute.voteCounter[dispute.appeals];
        require(dispute.lastSessionVote[msg.sender] != session); // Make sure he hasn't voted yet.
        // Note that it throws if the draws are incorrect or if it has no weight (not drawn yet).
        uint minWeight = hasWeightAtMin(msg.sender,_disputeID,_draws);
        
        dispute.lastSessionVote[msg.sender]=session;
        voteCounter.voteCount[_ruling]+=minWeight;
        if (voteCounter.winningCount<voteCounter.voteCount[_ruling]) {
            voteCounter.winningCount=voteCounter.voteCount[_ruling];
            voteCounter.winningChoice=_ruling;
        } else if (voteCounter.winningCount==voteCounter.voteCount[_ruling]) {
            voteCounter.winningChoice=0; // It's currently a tie.
        }
        for (uint i=0;i<minWeight;++i) {
            dispute.votes[dispute.appeals].push(Vote({
                account:msg.sender,
                ruling:_ruling
            }));
        }
        
        juror.atStake+=minWeight*(alpha*minActivatedToken)/ALPHA_DIVISOR;
    }
    
    /** @dev Steal part of the tokens of a juror who failed to vote.
     *  Note that a juror who voted but without all his weight can't be penalized.
     *  @param _jurorAddress Address of the juror to steal tokens from.
     *  @param _disputeID The ID of the dispute the juror was drawn.
     *  @param _draws The list of draws the juror was drawn. It draw numbering starts at 1 and the numbers should be increasing.
     */
    function penalizeInactiveJuror(address _jurorAddress, uint _disputeID, uint[] _draws) public {
        Dispute dispute = disputes[_disputeID];
        Juror storage inactiveJuror = jurors[_jurorAddress];
        require(period>Period.Vote);
        require(dispute.lastSessionVote[_jurorAddress]!=session); // Verify the juror hasn't voted.
        uint penality = hasWeightAtMin(_jurorAddress,_disputeID,_draws) * minActivatedToken * 2 * alpha / ALPHA_DIVISOR;
        
        penality = (penality<inactiveJuror.balance-inactiveJuror.atStake) ? penality : inactiveJuror.balance-inactiveJuror.atStake; // Make sure the penality is not higher than what the juror can lose.
        inactiveJuror.balance-=penality;
        jurors[msg.sender].balance+=penality/2; // Give half of the penalty to the caller.
        jurors[this].balance+=penality/2; // The other half to Kleros.
    }
    
    /** @dev Execute all the token repartition.
     *  Note that this function could consume to much gas if there is too much votes. It is O(v), where v is the number of votes for this dispute.
     *  In the next version, there will also be a function to execute it in multiple calls (but note that one shot execution, if possible is less expensive).
     *  @param _disputeID ID of the dispute.
     */
    function oneShotTokenRepartition(uint _disputeID) public onlyDuring(Period.Execution) {
        Dispute storage dispute = disputes[_disputeID];
        require(dispute.state==DisputeState.Open);
        require(dispute.session+dispute.appeals==session);
        
        uint winningChoice=dispute.voteCounter[dispute.appeals].winningChoice;
        uint amountShift=(alpha*minActivatedToken)/ALPHA_DIVISOR;
        for (uint i=0;i<=dispute.appeals;++i) {
            // If the result is not a tie, some parties are incoherent. Note that 0 (refuse to arbitrate) winning is not a tie.
            if (winningChoice!=0 || (dispute.voteCounter[dispute.appeals].voteCount[0] == dispute.voteCounter[dispute.appeals].winningCount)) {
                uint totalToRedistibute=0;
                uint nbCoherant=0;
                // First loop to penalize the incoherent votes.
                for (uint j=0;j<dispute.votes[i].length;++j) {
                    Vote storage vote = dispute.votes[i][j];
                    if (vote.ruling!=winningChoice) {
                        Juror storage juror = jurors[vote.account];
                        juror.balance-=amountShift;
                        totalToRedistibute+=amountShift;
                    } else {
                        ++nbCoherant;
                    }
                }
                if (nbCoherant==0) { // No one was coherant at this stage. Take the tokens.
                    jurors[this].balance+=totalToRedistibute;
                } else { // otherwise, redistribute them.
                    uint toRedistribute = totalToRedistibute/nbCoherant; // Note that few fractions of tokens can be lost but due to the high amount of decimals we don't care.
                    // Second loop to redistibute.
                    for (j=0;j<dispute.votes[i].length;++j) {
                        vote = dispute.votes[i][j];
                        if (vote.ruling==winningChoice) {
                            juror = jurors[vote.account];
                            juror.balance+=toRedistribute;
                        }
                    }
                }
            }
            // Third loop to lower the atStake in order to unlock tokens.
            for (j=0;j<dispute.votes[i].length;++j) {
                vote = dispute.votes[i][j];
                juror = jurors[vote.account];
                juror.atStake -= amountShift; // Note that it can't underflow due to amountShift not changing between vote and redistribution.
            }
        }
        dispute.state=DisputeState.Executable; // Since it was solved in one shot, go directly to the executable step.
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
            uint position = uint(keccak256(keccak256(randomNumber,_disputeID),draw)) % segmentSize; // Random position on the segment for draw.
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
    function appeal(uint _disputeID, bytes _extraData) public payable onlyDuring(Period.Appeal) {
        Dispute storage dispute = disputes[_disputeID];
        require(msg.value >= appealCost(_disputeID,_extraData));
        require(dispute.session+dispute.appeals == session); // Dispute of the current session.
        require(dispute.state==DisputeState.Open);
        
        dispute.appeals++;
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
    
    /** @dev Execute the ruling of a dispute which is in the state executable. UNTRUSTED.
     *  @param disputeID ID of the dispute to execute the ruling.
     */
    function executeRuling(uint disputeID) public {
        Dispute storage dispute = disputes[disputeID];
        require(dispute.state==DisputeState.Executable);
        
        dispute.state=DisputeState.Executed;
        dispute.arbitrated.rule(disputeID,dispute.voteCounter[dispute.appeals].winningChoice);
    }
    
}