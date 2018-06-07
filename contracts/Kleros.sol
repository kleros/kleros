/**
 *  @title Kleros
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  This code implements a simple version of Kleros.
 *  Bug Bounties: This code hasn't undertaken a bug bounty program yet.
 */

pragma solidity ^0.4.15;

import "kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";
import {MiniMeTokenERC20 as Pinakion} from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";
import "kleros-interaction/contracts/standard/rng/RNG.sol";
import {ApproveAndCallFallBack} from "minimetoken/contracts/MiniMeToken.sol";



contract Kleros is Arbitrator, ApproveAndCallFallBack {

    // **************************** //
    // *    Contract variables    * //
    // **************************** //

    // Variables which should not change after initialization.
    Pinakion public pinakion;

    // Variables which will subject to the governance mechanism.
    // Note they will only be able to be changed during the activation period (because a session assumes they don't change after it).
    RNG public rng; // Random Number Generator used to draw jurors.
    uint public arbitrationFeePerJuror = 0.05 ether; // The fee which will be paid to each juror.
    uint16 public defaultNumberJuror = 3; // Number of draw juror unless specified otherwise.
    uint public minActivatedToken = 0.1 * 1e18; // Minimum of tokens to be activated (in basic units).
    uint[5] public timePerPeriod; // The minimum time each period lasts (seconds).
    uint public alpha = 2000; // alpha in ‱.
    uint constant ALPHA_DIVISOR = 1e4; // Amount we need to dived alpha in ‱ to get the float value of alpha.

    // Variables changing during day to day interaction.
    uint public session = 1;      // Current session of the court.
    uint public lastPeriodChange; // The last time we changed of period (seconds).
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
        uint atStake;      // Total number of tokens the juror can loose in disputes he is drawn in. Those tokens are locked. Note that we can have atStake>balance but it should be statistically unlikely and does not pose issues.
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
        Executed    // Everything has been done and the dispute can't be interacted with anymore.
    }
    struct Dispute {
        Arbitrable arbitrated;       // Contract to be arbitrated.
        uint session;                // First session the dispute was schedule.
        uint appeals;                // Number of appeals.
        uint choices;                // The number of choices available to the jurors.
        uint16 initialNumberJurors;  // The initial number of jurors.
        uint arbitrationFeePerJuror; // The fee which will be paid to each juror.
        DisputeState state;          // The state of the dispute.
        Vote[][] votes;              // The votes in the form vote[appeals][voteID].
        VoteCounter[] voteCounter;   // The vote counters in the form voteCounter[appeals].
        mapping (address => uint) lastSessionVote; // Last session a juror has voted on this dispute. Is 0 if he never did.
        uint currentAppealToRepartition; // The current appeal we are repartitioning.
        AppealsRepartitioned[] appealsRepartitioned; // Track a partially repartitioned appeal in the form AppealsRepartitioned[appeal].
    }
    enum RepartitionStage {
      Incoherent,
      Coherent,
      AtStake,
      Complete
    }
    struct AppealsRepartitioned {
      uint totalToRedistribute; // total amount of tokens we have to redistribute
      uint nbcoherent; // number of coherent jurors for session
      uint currentIncoherentVote; // current vote for the incoherent loop
      uint currentCoherentVote; // current vote we need to count
      uint currentAtStakeVote; // current vote we need to count
      RepartitionStage stage;
    }

    Dispute[] public disputes;

    // **************************** //
    // *          Events          * //
    // **************************** //

    /** @dev Emitted when we pass to a new period.
     *  @param _period The new period.
     *  @param _session The current session.
     */
    event NewPeriod(Period _period, uint _session);

    /** @dev Emitted when a juror wins or loses tokens.
      * @param _account The juror affected.
      * @param _disputeID The ID of the dispute.
      * @param _amount The amount of parts of token which was won. Can be negative for lost amounts.
      */
    event TokenShift(address indexed _account, uint _disputeID, int _amount);

    /** @dev Emited when a juror wins arbitration fees.
      * @param _account The account affected.
      * @param _disputeID The ID of the dispute.
      * @param _amount The amount of weis which was won.
      */
    event ArbitrationReward(address indexed _account, uint _disputeID, uint _amount);

    // **************************** //
    // *         Modifiers        * //
    // **************************** //
    modifier onlyBy(address _account) { require(msg.sender==_account); _; }
    modifier onlyDuring(Period _period) { require(period==_period); _;}



    /** @dev Constructor.
     *  @param _pinakion The address of the pinakion contract.
     *  @param _rng The random number generator which will be used.
     *  @param _timePerPeriod The minimal time for each period (seconds).
     */
    function Kleros(Pinakion _pinakion, RNG _rng, uint[5] _timePerPeriod) public {
        pinakion=_pinakion;
        rng=_rng;
        lastPeriodChange=now;
        timePerPeriod=_timePerPeriod;
    }

    // **************************** //
    // *  Functions interacting   * //
    // *  with Pinakion contract  * //
    // **************************** //

    /** @dev Callback of approveAndCall - deposit pinakions of a juror in the contract. Should be called by the pinakion contract. TRUSTED.
     *  @param _from The address making the deposit.
     *  @param _value Amount of fractions of token to deposit.
     */
    function receiveApproval(address _from, uint _value, address, bytes) public onlyBy(pinakion) {
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
        require(juror.lastSession!=session);

        juror.balance-=_value;
        require(pinakion.transfer(msg.sender,_value));
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
        NewPeriod(period, session);
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
     *  Note that the complexity is O(d), where d is amount of times the juror was drawn.
     *  Since being drawn multiple time is a rare occurrence and that a juror can always vote with less weight than it has, it is not a problem.
     *  @param _disputeID The ID of the dispute the juror was drawn.
     *  @param _ruling The ruling given.
     *  @param _draws The list of draws the juror was drawn. It draw numbering starts at 1 and the numbers should be increasing.
     */
    function voteRuling(uint _disputeID, uint _ruling, uint[] _draws) public onlyDuring(Period.Vote) {
        Dispute storage dispute = disputes[_disputeID];
        Juror storage juror = jurors[msg.sender];
        VoteCounter storage voteCounter = dispute.voteCounter[dispute.appeals];
        require(dispute.lastSessionVote[msg.sender] != session); // Make sure he hasn't voted yet.
        require(_ruling<=dispute.choices);
        // Note that it throws if the draws are incorrect.
        require(validDraws(msg.sender,_disputeID,_draws));

        dispute.lastSessionVote[msg.sender]=session;
        voteCounter.voteCount[_ruling]+=_draws.length;
        if (voteCounter.winningCount<voteCounter.voteCount[_ruling]) {
            voteCounter.winningCount=voteCounter.voteCount[_ruling];
            voteCounter.winningChoice=_ruling;
        } else if (voteCounter.winningCount==voteCounter.voteCount[_ruling] && _draws.length!=0) {
            voteCounter.winningChoice=0; // It's currently a tie.
        }
        for (uint i=0;i<_draws.length;++i) {
            dispute.votes[dispute.appeals].push(Vote({
                account:msg.sender,
                ruling:_ruling
            }));
        }

        juror.atStake += _draws.length * getStakePerDraw();
        uint feeToPay = _draws.length*dispute.arbitrationFeePerJuror;
        msg.sender.transfer(feeToPay);
        ArbitrationReward(msg.sender,_disputeID,feeToPay);
    }

    /** @dev Steal part of the tokens of a juror who failed to vote.
     *  Note that a juror who voted but without all his weight can't be penalized.
     *  @param _jurorAddress Address of the juror to steal tokens from.
     *  @param _disputeID The ID of the dispute the juror was drawn.
     *  @param _draws The list of draws the juror was drawn. Numbering starts at 1 and the numbers should be increasing.
     */
    function penalizeInactiveJuror(address _jurorAddress, uint _disputeID, uint[] _draws) public {
        Dispute storage dispute = disputes[_disputeID];
        Juror storage inactiveJuror = jurors[_jurorAddress];
        require(period>Period.Vote);
        require(dispute.lastSessionVote[_jurorAddress]!=session); // Verify the juror hasn't voted.
        dispute.lastSessionVote[_jurorAddress]=session;
        require(validDraws(_jurorAddress,_disputeID,_draws));
        uint penality = _draws.length * minActivatedToken * 2 * alpha / ALPHA_DIVISOR;
        penality = (penality<inactiveJuror.balance-inactiveJuror.atStake) ? penality : inactiveJuror.balance-inactiveJuror.atStake; // Make sure the penality is not higher than what the juror can lose.
        inactiveJuror.balance-=penality;
        jurors[msg.sender].balance+=penality/2; // Give half of the penalty to the caller.
        jurors[this].balance+=penality/2; // The other half to Kleros.

        msg.sender.transfer(_draws.length*dispute.arbitrationFeePerJuror);
    }

    /** @dev Execute all the token repartition.
     *  Note that this function could consume to much gas if there is too much votes. It is O(v), where v is the number of votes for this dispute.
     *  In the next version, there will also be a function to execute it in multiple calls (but note that one shot execution, if possible, is less expensive).
     *  @param _disputeID ID of the dispute.
     */
    function oneShotTokenRepartition(uint _disputeID) public onlyDuring(Period.Execution) {
        Dispute storage dispute = disputes[_disputeID];
        require(dispute.state==DisputeState.Open);
        require(dispute.session+dispute.appeals<=session);

        uint winningChoice=dispute.voteCounter[dispute.appeals].winningChoice;
        uint amountShift = getStakePerDraw();
        for (uint i=0;i<=dispute.appeals;++i) {
            // If the result is not a tie, some parties are incoherent. Note that 0 (refuse to arbitrate) winning is not a tie.
            // Result is a tie if the winningChoice is 0 (refuse to arbitrate) and the choice 0 is not the most voted choice.
            // Note that in case of a "tie" among some choices including 0, parties who did not vote 0 are considered incoherent.
            if (winningChoice!=0 || (dispute.voteCounter[dispute.appeals].voteCount[0] == dispute.voteCounter[dispute.appeals].winningCount)) {
                uint totalToRedistribute=0;
                uint nbcoherent=0;
                // First loop to penalize the incoherent votes.
                for (uint j=0;j<dispute.votes[i].length;++j) {
                    Vote storage vote = dispute.votes[i][j];
                    if (vote.ruling!=winningChoice) {
                        Juror storage juror = jurors[vote.account];
                        uint penalty=amountShift<juror.balance ? amountShift : juror.balance;
                        juror.balance-=penalty;
                        TokenShift(vote.account,_disputeID,int(-penalty));
                        totalToRedistribute+=penalty;
                    } else {
                        ++nbcoherent;
                    }
                }
                if (nbcoherent==0) { // No one was coherent at this stage. Take the tokens.
                    jurors[this].balance+=totalToRedistribute;
                } else { // otherwise, redistribute them.
                    uint toRedistribute = totalToRedistribute/nbcoherent; // Note that few fractions of tokens can be lost but due to the high amount of decimals we don't care.
                    // Second loop to redistribute.
                    for (j=0;j<dispute.votes[i].length;++j) {
                        vote = dispute.votes[i][j];
                        if (vote.ruling==winningChoice) {
                            juror = jurors[vote.account];
                            juror.balance+=toRedistribute;
                            TokenShift(vote.account,_disputeID,int(toRedistribute));
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

    /* @dev Execute token repartition on a dispute for a specific number of votes.
    *  This should only be called if oneShotTokenRepartition will throw because there are too many votes (will use too much gas).
    *  NOTE There are 3 iterations per vote. e.g. A dispute with 1 appeal (2 sessions) and 3 votes per session will have 18 iterations
    *  @param _disputeId ID of the dispute.
    *  @param _maxIterations the maxium number of votes to repartition in this iteration
    */
    function multipleShotTokenRepartition(uint _disputeId, uint _maxIterations) public onlyDuring(Period.Execution) {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.state<=DisputeState.Resolving);
        require(dispute.session+dispute.appeals<=session);
        dispute.state=DisputeState.Resolving; // mark as resolving so oneShotTokenRepartition cannot be called on dispute

        uint winningChoice=dispute.voteCounter[dispute.appeals].winningChoice;
        uint amountShift = getStakePerDraw();
        uint currentIterations=0; // total votes we have repartitioned this iteration
        for (uint i=dispute.currentAppealToRepartition;i<=dispute.appeals;++i) {
            // make new AppealsRepartitioned
            if (dispute.appealsRepartitioned.length < i+1) {
              dispute.appealsRepartitioned.length++;
            }

            // If the result is a tie, no parties are incoherent and no need to move tokens. Note that 0 (refuse to arbitrate) winning is not a tie.
            if (winningChoice==0 && (dispute.voteCounter[dispute.appeals].voteCount[0] != dispute.voteCounter[dispute.appeals].winningCount)) {
              // if ruling is a tie we can skip to at stake
              dispute.appealsRepartitioned[i].stage = RepartitionStage.AtStake;
            }

            // First loop to penalize the incoherent votes.
            if (dispute.appealsRepartitioned[i].stage == RepartitionStage.Incoherent) {
                for (uint j=dispute.appealsRepartitioned[i].currentIncoherentVote;j<dispute.votes[i].length;++j) {
                    if (currentIterations >= _maxIterations) {
                        return;
                    }
                    Vote storage vote = dispute.votes[i][j];
                    if (vote.ruling!=winningChoice) {
                        Juror storage juror = jurors[vote.account];
                        uint penalty=amountShift<juror.balance ? amountShift : juror.balance;
                        juror.balance-=penalty;
                        TokenShift(vote.account,_disputeId,int(-penalty));
                        dispute.appealsRepartitioned[i].totalToRedistribute+=penalty;
                    } else {
                        ++dispute.appealsRepartitioned[i].nbcoherent;
                    }

                    ++dispute.appealsRepartitioned[i].currentIncoherentVote;
                    ++currentIterations;
                }

                dispute.appealsRepartitioned[i].stage = RepartitionStage.Coherent;
            }

            // Second loop to reward coherent voters
            if (dispute.appealsRepartitioned[i].stage == RepartitionStage.Coherent) {
                if (dispute.appealsRepartitioned[i].nbcoherent==0) { // No one was coherent at this stage. Take the tokens.
                    jurors[this].balance+=dispute.appealsRepartitioned[i].totalToRedistribute;
                    dispute.appealsRepartitioned[i].stage = RepartitionStage.AtStake;
                } else { // otherwise, redistribute them.
                    uint toRedistribute = dispute.appealsRepartitioned[i].totalToRedistribute/dispute.appealsRepartitioned[i].nbcoherent; // Note that few fractions of tokens can be lost but due to the high amount of decimals we don't care.
                    // Second loop to redistribute.
                    for (j=dispute.appealsRepartitioned[i].currentCoherentVote;j<dispute.votes[i].length;++j) {
                        if (currentIterations >= _maxIterations) {
                            return;
                        }
                        vote = dispute.votes[i][j];
                        if (vote.ruling==winningChoice) {
                            juror = jurors[vote.account];
                            juror.balance+=toRedistribute;
                            TokenShift(vote.account,_disputeId,int(toRedistribute));
                        }

                        ++currentIterations;
                        ++dispute.appealsRepartitioned[i].currentCoherentVote;
                    }

                    dispute.appealsRepartitioned[i].stage = RepartitionStage.AtStake;
                }
            }

            if (dispute.appealsRepartitioned[i].stage == RepartitionStage.AtStake) {
                // Third loop to lower the atStake in order to unlock tokens.
                for (j=dispute.appealsRepartitioned[i].currentAtStakeVote;j<dispute.votes[i].length;++j) {
                    if (currentIterations >= _maxIterations) {
                        return;
                    }
                    vote = dispute.votes[i][j];
                    juror = jurors[vote.account];
                    juror.atStake -= amountShift; // Note that it can't underflow due to amountShift not changing between vote and redistribution.

                    ++currentIterations;
                    ++dispute.appealsRepartitioned[i].currentAtStakeVote;
                }

                dispute.appealsRepartitioned[i].stage = RepartitionStage.Complete;
            }

            if (dispute.appealsRepartitioned[i].stage == RepartitionStage.Complete) {
              ++dispute.currentAppealToRepartition;
            }
        }

        dispute.state=DisputeState.Executable;
    }

    // **************************** //
    // *      Court functions     * //
    // *     Constant and Pure    * //
    // **************************** //

    /** @dev Return the amount of jurors which are or will be drawn in the dispute.
     *  The number of jurors is doubled and 1 is added at each appeal. We have proven the formula by recurrence.
     *  This avoid having a variable number of jurors which would be updated in order to save gas.
     *  @param _disputeID The ID of the dispute we compute the amount of jurors.
     *  @return nbJurors The number of jurors which are drawn.
     */
    function amountJurors(uint _disputeID) public constant returns(uint nbJurors) {
        Dispute storage dispute = disputes[_disputeID];
        return (dispute.initialNumberJurors+1) * 2**dispute.appeals - 1;
    }

    /** @dev Must be used to prove that a juror has been draw at least _draws.length times.
     *  We have to require the user to specify the draws that lead the juror to be drawn.
     *  Because doing otherwise (looping through all draws) could consume too much gas.
     *  @param _jurorAddress Address of the juror we want to prove was drawn.
     *  @param _disputeID The ID of the dispute the juror was drawn.
     *  @param _draws The list of draws the juror was drawn. It draw numbering starts at 1 and the numbers should be increasing.
     *  Note that in most cases this list will just contain 1 number.
     *  @param valid true if the draws are valid.
     */
    function validDraws(address _jurorAddress, uint _disputeID, uint[] _draws) public constant returns(bool valid) {
        uint draw = 0;
        Juror storage juror = jurors[_jurorAddress];
        Dispute storage dispute = disputes[_disputeID];
        uint nbJurors = amountJurors(_disputeID);

        if (juror.lastSession!=session) return false; // Make sure that the tokens were activated for this session.
        if (dispute.session+dispute.appeals != session) return false; // Make sure this currently a dispute.
        if (period<=Period.Draw) return false; // Make sure that it's already drawn.
        for (uint i;i<_draws.length;++i) {
            if (_draws[i]<=draw) return false; // Make sure that draws are always increasing to avoid someone inputing the same multiple times.
            draw = _draws[i];
            if (draw>nbJurors) return false;
            uint position = uint(keccak256(randomNumber,_disputeID,draw)) % segmentSize; // Random position on the segment for draw.
            require(position>=juror.segmentStart);
            require(position<juror.segmentEnd);
        }

        return true;
    }

    // **************************** //
    // *   Arbitrator functions   * //
    // *   Modifying the state    * //
    // **************************** //

    /** @dev Create a dispute. Must be called by the arbitrable contract.
     *  Must be paid at least arbitrationCost().
     *  @param _choices Amount of choices the arbitrator can make in this dispute.
     *  @param _extraData Null for the default number. Otherwise, first 16 bytes will be used to return the number of jurors.
     *  @return disputeID ID of the dispute created.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint disputeID) {
        uint16 nbJurors = extraDataToNbJurors(_extraData);
        require(msg.value >= arbitrationCost(_extraData));

        disputeID = disputes.length++;
        Dispute storage dispute = disputes[disputeID];
        dispute.arbitrated = Arbitrable(msg.sender);
        if (period < Period.Draw) // If drawing did not start schedule it for the current session.
            dispute.session = session;
        else // Otherwise schedule it for the next one.
            dispute.session = session+1;
        dispute.choices = _choices;
        dispute.initialNumberJurors = nbJurors;
        dispute.arbitrationFeePerJuror = arbitrationFeePerJuror; // We story it as it will be able to be changed through the governance mechanism.
        dispute.votes.length++;
        dispute.voteCounter.length++;

        DisputeCreation(disputeID, Arbitrable(msg.sender));
        return disputeID;
    }

    /** @dev Appeal a ruling. Note that it has to be called before the arbitrator contract calls rule.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Standard but not used by this contract.
     */
    function appeal(uint _disputeID, bytes _extraData) public payable onlyDuring(Period.Appeal) {
        super.appeal(_disputeID,_extraData);
        Dispute storage dispute = disputes[_disputeID];
        require(msg.value >= appealCost(_disputeID,_extraData));
        require(dispute.session+dispute.appeals == session); // Dispute of the current session.

        dispute.appeals++;
        dispute.votes.length++;
        dispute.voteCounter.length++;

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

    // **************************** //
    // *   Arbitrator functions   * //
    // *    Constant and pure     * //
    // **************************** //

    /** @dev Compute the cost of arbitration. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _extraData Null for the default number. Other first 16 bytes will be used to return the number of jurors.
     *  @return fee Amount to be paid.
     */
    function arbitrationCost(bytes _extraData) public constant returns(uint fee) {
        return extraDataToNbJurors(_extraData) * arbitrationFeePerJuror;
    }

    /** @dev Compute the cost of appeal. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _disputeID ID of the dispute to be appealed.
     *  @param _extraData Is not used there.
     *  @return fee Amount to be paid.
     */
    function appealCost(uint _disputeID, bytes _extraData) public constant returns(uint fee) {
        Dispute storage dispute = disputes[_disputeID];
        return (2*amountJurors(_disputeID) + 1) * dispute.arbitrationFeePerJuror;
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

    /** @dev Compute the minimum activated pinakions in alpha.
     * Note there may be multiple draws for a single user on a single dispute.
    */
    function getStakePerDraw() public constant returns (uint minActivatedTokenInAlpha) {
        return (alpha*minActivatedToken)/ALPHA_DIVISOR;
    }


    // **************************** //
    // *     Constant getters     * //
    // **************************** //

    /** @dev Getter for account in Vote.
     *  @param _disputeID ID of the dispute.
     *  @param _appeals Which appeal (or 0 for the initial session).
     *  @param _voteID The ID of the vote for this appeal (or initial session).
     *  @return account The address of the voter.
     */
    function getVoteAccount(uint _disputeID, uint _appeals, uint _voteID) public constant returns(address account) {
        return disputes[_disputeID].votes[_appeals][_voteID].account;
    }

    /** @dev Getter for ruling in Vote.
     *  @param _disputeID ID of the dispute.
     *  @param _appeals Which appeal (or 0 for the initial session).
     *  @param _voteID The ID of the vote for this appeal (or initial session).
     *  @return ruling The ruling given by the voter.
     */
    function getVoteRuling(uint _disputeID, uint _appeals, uint _voteID) public constant returns(uint ruling) {
        return disputes[_disputeID].votes[_appeals][_voteID].ruling;
    }

    /** @dev Getter for winningChoice in VoteCounter.
     *  @param _disputeID ID of the dispute.
     *  @param _appeals Which appeal (or 0 for the initial session).
     *  @return winningChoice The currently winning choice (or 0 if it's tied). Note that 0 can also be return if the juror mainly refuse to arbitrate.
     */
    function getWinningChoice(uint _disputeID, uint _appeals) public constant returns(uint winningChoice) {
        return disputes[_disputeID].voteCounter[_appeals].winningChoice;
    }

    /** @dev Getter for winningCount in VoteCounter.
     *  @param _disputeID ID of the dispute.
     *  @param _appeals Which appeal (or 0 for the initial session).
     *  @return winningCount The amount of votes the winning choice (or those who are tied) has.
     */
    function getWinningCount(uint _disputeID, uint _appeals) public constant returns(uint winningCount) {
        return disputes[_disputeID].voteCounter[_appeals].winningCount;
    }

    /** @dev Getter for voteCount in VoteCounter.
     *  @param _disputeID ID of the dispute.
     *  @param _appeals Which appeal (or 0 for the initial session).
     *  @param _choice The choice.
     *  @return voteCount The amount of votes the winning choice (or those who are tied) has.
     */
    function getVoteCount(uint _disputeID, uint _appeals, uint _choice) public constant returns(uint voteCount) {
        return disputes[_disputeID].voteCounter[_appeals].voteCount[_choice];
    }

    /** @dev Getter for lastSessionVote in Dispute.
     *  @param _disputeID ID of the dispute.
     *  @param _juror The juror we want to get the last session he voted.
     *  @return lastSessionVote The last session the juror voted.
     */
    function getLastSessionVote(uint _disputeID, address _juror) public constant returns(uint lastSessionVote) {
        return disputes[_disputeID].lastSessionVote[_juror];
    }

    /** @dev Is the juror drawn in the draw of the dispute.
     *  @param _disputeID ID of the dispute.
     *  @param _juror The juror.
     *  @param _draw The draw. Note that it starts at 1.
     *  @return drawn True if the juror is drawn, false otherwise.
     */
    function isDrawn(uint _disputeID, address _juror, uint _draw) public constant returns(bool drawn) {
        Dispute storage dispute = disputes[_disputeID];
        Juror storage juror = jurors[_juror];
        if (juror.lastSession!=session
        || (dispute.session+dispute.appeals != session)
        || period<=Period.Draw
        || _draw > amountJurors(_disputeID)
        || _draw == 0
        || segmentSize == 0
        ) {
            return false;
        } else {
            uint position = uint(keccak256(randomNumber,_disputeID,_draw)) % segmentSize;
            return (position>=juror.segmentStart) && (position<juror.segmentEnd);
        }

    }

    /** @dev Return the current ruling of a dispute. This is useful for parties to know if they should appeal.
     *  @param _disputeID ID of the dispute.
     *  @return ruling The current ruling which will be given if there is no appeal. If it is not available, return 0.
     */
    function currentRuling(uint _disputeID) public constant returns(uint ruling) {
        Dispute storage dispute = disputes[_disputeID];
        return dispute.voteCounter[dispute.appeals].winningChoice;
    }

    /** @dev Return the status of a dispute.
     *  @param _disputeID ID of the dispute to rule.
     *  @return status The status of the dispute.
     */
    function disputeStatus(uint _disputeID) public constant returns(DisputeStatus status) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.session+dispute.appeals<session) // Dispute of past session.
            return DisputeStatus.Solved;
        else if(dispute.session+dispute.appeals==session) { // Dispute of current session.
            if (dispute.state==DisputeState.Open) {
                if (period < Period.Appeal)
                    return DisputeStatus.Waiting;
                else if (period == Period.Appeal)
                    return DisputeStatus.Appealable;
                else return DisputeStatus.Solved;
            } else return DisputeStatus.Solved;
        } else return DisputeStatus.Waiting; // Dispute for future session.
    }

}
