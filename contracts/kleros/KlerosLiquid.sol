pragma solidity ^0.4.24;

import "kleros-interaction/contracts/standard/rng/RNG.sol";
import "kleros-interaction/contracts/standard/arbitration/Arbitrable.sol";
import { MiniMeTokenERC20 as Pinakion } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";
import "minimetoken/contracts/TokenController.sol";

import "../data-structures/SortitionSumTreeFactory.sol";

/**
 *  @title KlerosLiquid
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev The main Kleros contract with dispute resolution logic for the Athena release.
 */
contract KlerosLiquid is SortitionSumTreeFactory, TokenController, Arbitrator {
    /* Enums */

    // General
    enum Phase {
      staking, // Stake sum trees can be updated. Pass after `minStakingTime` passes and there is at least one dispute without jurors.
      generating, // Waiting on random number. Pass as soon as it is ready.
      drawing // Jurors can be drawn. Pass after all disputes have jurors or `maxDrawingTime` passes.
    }

    // Dispute
    enum Period {
      evidence, // Evidence can be submitted. This is also when drawing has to take place.
      commit, // Jurors commit a hashed vote. This is skipped for courts without hidden votes.
      vote, // Jurors reveal/cast their vote depending on wether the court has hidden votes or not.
      appeal, // The dispute can be appealed.
      execution // Tokens are redistributed and the ruling is executed.
    }

    /* Structs */

    // General
    struct Court {
        uint96 parent; // The parent court.
        uint[] children; // List of child courts.
        bool hiddenVotes; // Wether to use commit and reveal or not.
        uint minStake; // Minimum tokens needed to stake in the court.
        uint alpha; // Basis point of tokens that are lost when incoherent.
        uint jurorFee; // Arbitration fee paid to each juror.
        // The appeal after the one that reaches this number of jurors will go to the parent court if any, otherwise, no more appeals are possible.
        uint jurorsForJump;
        uint[4] timesPerPeriod; // The time allotted to each dispute period in the form `timesPerPeriod[period]`.
    }
    struct DelayedSetStake {
        address account; // The address of the juror.
        uint96 subcourtID; // The ID of the subcourt.
        uint stake; // The new stake.
    }

    // Dispute
    struct Vote {
        address account; // The address of the juror.
        bytes32 commit; // The commit of the juror. For courts with hidden votes.
        uint choice; // The choice of the juror.
        bool voted; // True if the vote has been cast or revealed, false otherwise.
    }
    struct VoteCounter {
        // The choice with the most votes. Note that in the case of a tie, it is the choice that reached the tied number of votes first.
        uint winningChoice;
        uint[] counts; // The sum of votes for each choice in the form `counts[choice]`.
        bool tied; // True if there is a tie, false otherwise.
    }
    struct Dispute { // Note that appeal `0` is equivalent to the first round of the dispute.
        uint96 subcourtID; // The ID of the subcourt the dispute is in.
        Arbitrable arbitrated; // The arbitrated arbitrable contract.
        // The number of choices jurors have when voting. This does not include choice `0` which is reserved for "refuse to arbitrate"/"no ruling".
        uint numberOfChoices;
        Period period; // The current period of the dispute.
        uint lastPeriodChange; // The last time the period was changed.
        // The votes in the form `votes[appeal][voteID]`. On each round, a new list is pushed and packed with as many empty votes as there are draws.
        Vote[][] votes;
        VoteCounter[] voteCounters; // The vote counters in the form `voteCounters[appeal]`.
        uint[] jurorAtStake; // The amount of tokens at stake for each juror in the form `jurorAtStake[appeal]`.
        uint[] totalJurorFees; // The total juror fees paid in the form `totalJurorFees[appeal]`.
        uint drawsPerRound; // A counter of draws made in the current round.
        uint commitsPerRound; // A counter of commits made in the current round.
        uint votesPerRound; // A counter of votes made in the current round.
        uint[] repartitionsPerRound; // A counter of vote reward repartitions made in each round in the form `repartitionsPerRound[appeal]`.
        uint[] penaltiesPerRound; // The amount of tokens collected from penalties in each round in the form `penaltiesPerRound[appeal]`.
        uint[2][] rewardsPerRound; // The amount of tokens and ETH rewarded in each round in the form `rewardsPerRound[appeal][tokens, ETH]`.
        bool ruled; // True if the ruling has been executed, false otherwise.
    }

    // Juror
    struct Juror {
        uint96[] subcourtIDs; // The IDs of subcourts where the juror has stake path ends.
        uint stakedTokens; // The juror's total amount of tokens staked in subcourts.
        uint lockedTokens; // The juror's total amount of tokens at stake in disputes.
    }

    /* Events */

    /** @dev Emitted when we pass to a new phase.
     *  @param _phase The new phase.
     */
    event NewPhase(Phase _phase);

    /** @dev Emitted when a dispute passes to a new period.
     *  @param _disputeID The ID of the dispute.
     *  @param _period The new period.
     */
    event NewPeriod(uint indexed _disputeID, Period _period);

    /** @dev Emitted when a juror's stake is set.
     *  @param _address The address of the juror.
     *  @param _subcourtID The ID of the subcourt at the end of the stake path.
     *  @param _stake The new stake.
     *  @param _newTotalStake The new total stake.
     */
    event StakeSet(address indexed _address, uint _subcourtID, uint _stake, uint _newTotalStake);

    /** @dev Emitted when a juror is drawn.
     *  @param _address The drawn address.
     *  @param _disputeID The ID of the dispute.
     *  @param _voteID The vote ID.
     */
    event Draw(address indexed _address, uint indexed _disputeID, uint _voteID);

    /** @dev Emitted when a juror wins or loses tokens and ETH from a dispute.
     *  @param _address The juror affected.
     *  @param _disputeID The ID of the dispute.
     *  @param _tokenAmount The amount of tokens won or lost.
     *  @param _ETHAmount The amount of ETH won or lost.
     */
    event TokenAndETHShift(address indexed _address, uint indexed _disputeID, int _tokenAmount, int _ETHAmount);

    /* Storage */

    // General Constants
    uint public constant NON_PAYABLE_AMOUNT = (2 ** 256 - 2) / 2;
    uint public constant ALPHA_DIVISOR = 1e4;
    // General Contracts
    address public governor;
    Pinakion public pinakion;
    RNG public RNGenerator;
    // General Dynamic
    Phase public phase;
    uint public lastPhaseChange;
    uint public disputesWithoutJurors;
    uint public RNBlock;
    uint public RN;
    uint public minStakingTime;
    uint public maxDrawingTime;
    // General Storage
    Court[] public courts;
    mapping(uint => DelayedSetStake) public delayedSetStakes;
    uint public nextDelayedSetStake = 1;
    uint public lastDelayedSetStake;

    // Dispute
    Dispute[] public disputes;

    // Juror
    mapping(address => Juror) internal jurors;

    /* Modifiers */

    /** @dev Requires a specific phase.
     *  @param _phase The required phase.
     */
    modifier onlyDuringPhase(Phase _phase) {require(phase == _phase, "Incorrect phase."); _;}

    /** @dev Requires a specific period in a dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _period The required period.
     */
    modifier onlyDuringPeriod(uint _disputeID, Period _period) {require(disputes[_disputeID].period == _period, "Incorrect period."); _;}

    /** @dev Requires that the sender is the governor. */
    modifier onlyByGovernor() {require(governor == msg.sender, "Can only be called by the governor."); _;}

    /* Constructor */

    /** @dev Constructs the KlerosLiquid contract.
     *  @param _governor The governor's address.
     *  @param _pinakion The address of the token contract.
     *  @param _RNGenerator The address of the RNG contract.
     *  @param _minStakingTime The minimum time that the staking phase should last.
     *  @param _maxDrawingTime The maximum time that the drawing phase should last.
     *  @param _hiddenVotes The `hiddenVotes` property value of the general court.
     *  @param _minStake The `minStake` property value of the general court.
     *  @param _alpha The `alpha` property value of the general court.
     *  @param _jurorFee The `jurorFee` property value of the general court.
     *  @param _jurorsForJump The `jurorsForJump` property value of the general court.
     *  @param _timesPerPeriod The `timesPerPeriod` property value of the general court.
     *  @param _sortitionSumTreeK The number of children per node of the general court's sortition sum tree.
     */
    constructor(
        address _governor,
        Pinakion _pinakion,
        RNG _RNGenerator,
        uint _minStakingTime,
        uint _maxDrawingTime,
        bool _hiddenVotes,
        uint _minStake,
        uint _alpha,
        uint _jurorFee,
        uint _jurorsForJump,
        uint[4] _timesPerPeriod,
        uint _sortitionSumTreeK
    ) public {
        // Initialize contract.
        governor = _governor;
        pinakion = _pinakion;
        RNGenerator = _RNGenerator;
        minStakingTime = _minStakingTime;
        maxDrawingTime = _maxDrawingTime;
        lastPhaseChange = now;

        // Create the general court.
        courts.push(Court({
            parent: 0,
            children: new uint[](0),
            hiddenVotes: _hiddenVotes,
            minStake: _minStake,
            alpha: _alpha,
            jurorFee: _jurorFee,
            jurorsForJump: _jurorsForJump,
            timesPerPeriod: _timesPerPeriod
        }));
        createTree(bytes32(0), _sortitionSumTreeK);
    }

    /* External */

    /** @dev Lets the governor call anything on behalf of the contract.
     *  @param _destination The destination of the call.
     *  @param _amount The value sent with the call.
     *  @param _data The data sent with the call.
     */
    function executeGovernorProposal(address _destination, uint _amount, bytes _data) external onlyByGovernor {
        _destination.call.value(_amount)(_data); // solium-disable-line security/no-call-value
    }

    /** @dev Changes the `governor` storage variable.
     *  @param _governor The new value for the `governor` storage variable.
     */
    function changeGovernor(address _governor) external onlyByGovernor {
        governor = _governor;
    }

    /** @dev Changes the `pinakion` storage variable.
     *  @param _pinakion The new value for the `pinakion` storage variable.
     */
    function changePinakion(Pinakion _pinakion) external onlyByGovernor {
        pinakion = _pinakion;
    }

    /** @dev Changes the `RNGenerator` storage variable.
     *  @param _RNGenerator The new value for the `RNGenerator` storage variable.
     */
    function changeRNGenerator(RNG _RNGenerator) external onlyByGovernor {
        RNGenerator = _RNGenerator;
    }

    /** @dev Changes the `minStakingTime` storage variable.
     *  @param _minStakingTime The new value for the `minStakingTime` storage variable.
     */
    function changeMinStakingTime(uint _minStakingTime) external onlyByGovernor {
        minStakingTime = _minStakingTime;
    }

    /** @dev Changes the `maxDrawingTime` storage variable.
     *  @param _maxDrawingTime The new value for the `maxDrawingTime` storage variable.
     */
    function changeMaxDrawingTime(uint _maxDrawingTime) external onlyByGovernor {
        maxDrawingTime = _maxDrawingTime;
    }

    /** @dev Creates a subcourt under a specified parent court.
     *  @param _parent The `parent` property value of the subcourt.
     *  @param _hiddenVotes The `hiddenVotes` property value of the subcourt.
     *  @param _minStake The `minStake` property value of the subcourt.
     *  @param _alpha The `alpha` property value of the subcourt.
     *  @param _jurorFee The `jurorFee` property value of the subcourt.
     *  @param _jurorsForJump The `jurorsForJump` property value of the subcourt.
     *  @param _timesPerPeriod The `timesPerPeriod` property value of the subcourt.
     *  @param _sortitionSumTreeK The number of children per node of the subcourt's sortition sum tree.
     */
    function createSubcourt(
        uint96 _parent,
        bool _hiddenVotes,
        uint _minStake,
        uint _alpha,
        uint _jurorFee,
        uint _jurorsForJump,
        uint[4] _timesPerPeriod,
        uint _sortitionSumTreeK
    ) external onlyByGovernor {
        require(courts.length < 2 ** 96, "Maximum number of subcourts reached.");
        require(courts[_parent].minStake <= _minStake, "A subcourt cannot be a child of a subcourt with a higher minimum stake.");

        // Create the subcourt.
        uint96 subcourtID = uint96(
            courts.push(Court({
                parent: _parent,
                children: new uint[](0),
                hiddenVotes: _hiddenVotes,
                minStake: _minStake,
                alpha: _alpha,
                jurorFee: _jurorFee,
                jurorsForJump: _jurorsForJump,
                timesPerPeriod: _timesPerPeriod
            })) - 1
        );
        createTree(bytes32(subcourtID), _sortitionSumTreeK);

        // Update the parent.
        courts[_parent].children.push(subcourtID);
    }

    /** @dev Changes the `hiddenVotes` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _hiddenVotes The new value for the `hiddenVotes` property value.
     */
    function changeSubcourtHiddenVotes(uint96 _subcourtID, bool _hiddenVotes) external onlyByGovernor {
        courts[_subcourtID].hiddenVotes = _hiddenVotes;
    }

    /** @dev Changes the `minStake` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _minStake The new value for the `minStake` property value.
     */
    function changeSubcourtMinStake(uint96 _subcourtID, uint _minStake) external onlyByGovernor {
        courts[_subcourtID].minStake = _minStake;
    }

    /** @dev Changes the `alpha` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _alpha The new value for the `alpha` property value.
     */
    function changeSubcourtAlpha(uint96 _subcourtID, uint _alpha) external onlyByGovernor {
        courts[_subcourtID].alpha = _alpha;
    }

    /** @dev Changes the `jurorFee` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _jurorFee The new value for the `jurorFee` property value.
     */
    function changeSubcourtJurorFee(uint96 _subcourtID, uint _jurorFee) external onlyByGovernor {
        courts[_subcourtID].jurorFee = _jurorFee;
    }

    /** @dev Changes the `jurorsForJump` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _jurorsForJump The new value for the `jurorsForJump` property value.
     */
    function changeSubcourtJurorsForJump(uint96 _subcourtID, uint _jurorsForJump) external onlyByGovernor {
        courts[_subcourtID].jurorsForJump = _jurorsForJump;
    }

    /** @dev Changes the `timesPerPeriod` property value of the specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _timesPerPeriod The new value for the `timesPerPeriod` property value.
     */
    function changeSubcourtTimesPerPeriod(uint96 _subcourtID, uint[4] _timesPerPeriod) external onlyByGovernor {
        courts[_subcourtID].timesPerPeriod = _timesPerPeriod;
    }

    /** @dev Pass the phase. TRUSTED */
    function passPhase() external {
        if (phase == Phase.staking) {
            require(now - lastPhaseChange >= minStakingTime, "The minimum staking time has not passed yet.");
            require(disputesWithoutJurors > 0, "There are no disputes that need jurors.");
            RNBlock = block.number + 1;
            RNGenerator.requestRN(RNBlock);
            phase = Phase.generating;
        } else if (phase == Phase.generating) {
            RN = RNGenerator.getUncorrelatedRN(RNBlock);
            require(RN != 0, "Random number is not ready yet.");
            phase = Phase.drawing;
        } else if (phase == Phase.drawing) {
            require(disputesWithoutJurors == 0 || now - lastPhaseChange >= maxDrawingTime, "There are still disputes without jurors and the maximum drawing time has not passed yet.");
            phase = Phase.staking;
        }

        lastPhaseChange = now;
        emit NewPhase(phase);
    }

    /** @dev Pass the period of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     */
    function passPeriod(uint _disputeID) external {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period == Period.evidence) {
            require(now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)], "The evidence period time has not passed yet.");
            require(dispute.drawsPerRound == dispute.votes[dispute.votes.length - 1].length, "The dispute has not finished drawing yet.");
            dispute.period = courts[dispute.subcourtID].hiddenVotes ? Period.commit : Period.vote;
        } else if (dispute.period == Period.commit) {
            require(
                now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.commitsPerRound == dispute.votes[dispute.votes.length - 1].length,
                "The commit period time has not passed yet and not every juror has committed yet."
            );
            dispute.period = Period.vote;
        } else if (dispute.period == Period.vote) {
            require(
                now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.votesPerRound == dispute.votes[dispute.votes.length - 1].length,
                "The vote period time has not passed yet and not every juror has voted yet."
            );
            dispute.period = Period.appeal;
        } else if (dispute.period == Period.appeal) {
            require(now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)], "The appeal period time has not passed yet.");
            dispute.period = Period.execution;
        } else if (dispute.period == Period.execution) {
            revert("The dispute is already in the last period.");
        }

        dispute.lastPeriodChange = now;
        emit NewPeriod(_disputeID, dispute.period);
    }

    /** @dev Sets the caller's stake in a subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _stake The new stake.
     */
    function setStake(uint96 _subcourtID, uint128 _stake) external {
        _setStake(msg.sender, _subcourtID, _stake);
    }

    /** @dev Execute the next delayed set stakes.
     *  @param _iterations The number of delayed set stakes to execute.
     */
    function executeDelayedSetStakes(uint _iterations) external onlyDuringPhase(Phase.staking) {
        uint actualIterations = (nextDelayedSetStake + _iterations) - 1 > lastDelayedSetStake ?
            (lastDelayedSetStake + 1) - nextDelayedSetStake : _iterations;
        for (uint i = 0; i < actualIterations; i++) {
            DelayedSetStake storage delayedSetStake = delayedSetStakes[i];
            _setStake(
                delayedSetStake.account,
                delayedSetStake.subcourtID,
                delayedSetStake.stake
            );
            delete delayedSetStakes[i];
        }
        nextDelayedSetStake += actualIterations;
    }

    /** @dev Draws jurors for a dispute. Can be called in parts. `O(n)` where `n` is the number of iterations to run.
     *  @param _disputeID The ID of the dispute.
     *  @param _iterations The number of iterations to run.
     */
    function drawVotes(uint _disputeID, uint _iterations) external onlyDuringPhase(Phase.drawing) onlyDuringPeriod(_disputeID, Period.evidence) {
        Dispute storage dispute = disputes[_disputeID];
        uint startIndex = dispute.drawsPerRound;
        uint endIndex = startIndex + _iterations;

        // Avoid going out of range.
        if (endIndex > dispute.votes[dispute.votes.length - 1].length) endIndex = dispute.votes[dispute.votes.length - 1].length;
        for (uint i = startIndex; i < endIndex; i++) {
            // Draw from sortition tree.
            (
                address drawnAddress,
                uint subcourtID
            ) = stakePathIDToAccountAndSubcourtID(super.draw(bytes32(dispute.subcourtID), uint(keccak256(RN, _disputeID, i))));

            // Save the vote.
            dispute.votes[dispute.votes.length - 1][i].account = drawnAddress;
            dispute.drawsPerRound++;
            jurors[msg.sender].lockedTokens += dispute.jurorAtStake[dispute.jurorAtStake.length - 1];
            emit Draw(drawnAddress, _disputeID, i);

            // If dispute is fully drawn.
            if (i == dispute.votes[dispute.votes.length - 1].length - 1) disputesWithoutJurors--;
        }
    }

    /** @dev Sets the caller's commits for the specified votes. `O(n)` where `n` is the number of commits.
     *  @param _disputeID The ID of the dispute.
     *  @param _voteIDs The IDs of the votes.
     *  @param _commits The commits.
     */
    function commit(uint _disputeID, uint[] _voteIDs, bytes32[] _commits) external onlyDuringPeriod(_disputeID, Period.commit) {
        Dispute storage dispute = disputes[_disputeID];
        for (uint i = 0; i < _voteIDs.length; i++) {
            require(dispute.votes[dispute.votes.length - 1][_voteIDs[i]].account == msg.sender, "The caller has to own the vote.");
            require(dispute.votes[dispute.votes.length - 1][_voteIDs[i]].commit == bytes32(0), "Already committed this vote.");
            dispute.votes[dispute.votes.length - 1][_voteIDs[i]].commit = _commits[i];
        }
        dispute.commitsPerRound += _voteIDs.length;
    }

    /** @dev Sets the caller's choices for the specified votes. `O(n)` where `n` is the number of votes.
     *  @param _disputeID The ID of the dispute.
     *  @param _voteIDs The IDs of the votes.
     *  @param _choice The choice.
     *  @param _salts The salts for the commits if the votes were hidden.
     */
    function vote(uint _disputeID, uint[] _voteIDs, uint _choice, uint[] _salts) external onlyDuringPeriod(_disputeID, Period.vote) {
        Dispute storage dispute = disputes[_disputeID];

        // Save the votes.
        for (uint i = 0; i < _voteIDs.length; i++) {
            require(dispute.votes[dispute.votes.length - 1][_voteIDs[i]].account == msg.sender, "The caller has to own the vote.");
            require(dispute.numberOfChoices >= _choice, "The choice has to be less than or equal to the number of choices for the dispute.");
            require(
                !courts[dispute.subcourtID].hiddenVotes || dispute.votes[dispute.votes.length - 1][_voteIDs[i]].commit == keccak256(_choice, _salts[i]),
                "The commit must match the choice in subcourts with hidden votes."
            );
            require(!dispute.votes[dispute.votes.length - 1][_voteIDs[i]].voted, "Vote already cast.");
            dispute.votes[dispute.votes.length - 1][_voteIDs[i]].choice = _choice;
            dispute.votes[dispute.votes.length - 1][_voteIDs[i]].voted = true;
        }
        dispute.votesPerRound += _voteIDs.length;

        // Update winning choice.
        VoteCounter storage voteCounter = dispute.voteCounters[dispute.voteCounters.length - 1];
        voteCounter.counts[_choice] += _voteIDs.length;
        if (voteCounter.counts[_choice] == voteCounter.counts[voteCounter.winningChoice]) { // Tie.
            if (!voteCounter.tied) voteCounter.tied = true;
        } else if (voteCounter.counts[_choice] > voteCounter.counts[voteCounter.winningChoice]) { // New winner.
            voteCounter.winningChoice = _choice;
            if (voteCounter.tied) voteCounter.tied = false;
        }
    }

    /** @dev Computes the token and ETH rewards for a specified case. NOTE: Temporary function until solidity increases local variable allowance.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     */
    function computeTokenAndETHRewards(uint _disputeID, uint _appeal) private {
        Dispute storage dispute = disputes[_disputeID];
        uint winningChoice = dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
        uint coherentCount = dispute.voteCounters[_appeal].counts[winningChoice];

        // Distribute penalties and arbitration fees between coherent voters,
        // if there is a tie, there are no penalties to distribute and arbitration fees are distributed between every juror.
        dispute.rewardsPerRound[_appeal][0] = dispute.voteCounters[dispute.voteCounters.length - 1].tied ?
            0 : dispute.penaltiesPerRound[_appeal] / coherentCount;
        dispute.rewardsPerRound[_appeal][1] = dispute.voteCounters[dispute.voteCounters.length - 1].tied ?
            dispute.totalJurorFees[_appeal] / dispute.votes[_appeal].length : dispute.totalJurorFees[_appeal] / coherentCount;
    }

    /** @dev Repartitions tokens and ETH for a specified appeal in a specified dispute. Can be called in parts.
     *  `O(i + j * (n + c + p * log(s)))` where `i` is the number of iterations to run, `j` is the number of jurors that need to be unstaked, `n` is the maximum number of children of one of these jurors' subcourts, `c` is the maximum number of subcourts one of these jurors has staked in, `p` is the depth of the subcourt tree, and `s` is the maximum number of stakers in one of these subcourts.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     *  @param _iterations The number of iterations to run.
     */
    function execute(uint _disputeID, uint _appeal, uint _iterations) external onlyDuringPeriod(_disputeID, Period.execution) {
        Dispute storage dispute = disputes[_disputeID];
        uint winningChoice = dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
        uint startIndex = dispute.repartitionsPerRound[_appeal];
        uint endIndex = startIndex + _iterations;

        // Avoid going out of range. We loop over the votes twice, first to collect penalties, and second to distribute them as rewards along with arbitration fees.
        if (endIndex > dispute.votes[_appeal].length * 2) endIndex = dispute.votes[_appeal].length * 2;
        for (uint i = startIndex; i < endIndex; i++) {
            Vote storage vote = dispute.votes[_appeal][i % dispute.votes[_appeal].length];
            if (vote.choice == winningChoice || dispute.voteCounters[dispute.voteCounters.length - 1].tied) { // Winning vote or it's a tie.
                if (i >= dispute.votes[_appeal].length) { // Only execute in the second half of the iterations.

                    // Reward.
                    uint tokenReward = dispute.rewardsPerRound[_appeal][0];
                    uint ETHReward = dispute.rewardsPerRound[_appeal][1];
                    pinakion.transfer(vote.account, tokenReward);
                    vote.account.send(ETHReward);
                    emit TokenAndETHShift(vote.account, _disputeID, int(tokenReward), int(ETHReward));
                    jurors[vote.account].lockedTokens -= dispute.jurorAtStake[_appeal];
                }
            } else { // Losing vote and it's not a tie.
                if (i < dispute.votes[_appeal].length) { // Only execute in the first half of the iterations.

                    // Penalize.
                    uint penalty = dispute.jurorAtStake[_appeal] > pinakion.balanceOf(vote.account) ? pinakion.balanceOf(vote.account) : dispute.jurorAtStake[_appeal];
                    pinakion.transferFrom(vote.account, this, penalty);
                    emit TokenAndETHShift(vote.account, _disputeID, -int(penalty), 0);
                    dispute.penaltiesPerRound[_appeal] += penalty;
                    jurors[vote.account].lockedTokens -= dispute.jurorAtStake[_appeal];

                    // Unstake juror if his penalty made balance less than his total stake or if he lost due to inactivity.
                    if (pinakion.balanceOf(vote.account) < jurors[vote.account].stakedTokens || !vote.voted)
                        for (uint j = 0; j < jurors[vote.account].subcourtIDs.length; j++)
                            _setStake(vote.account, jurors[vote.account].subcourtIDs[j], 0);
                }
            }
            dispute.repartitionsPerRound[_appeal]++;

            // Finished penalizing, compute and store rewards.
            if (i == dispute.votes[_appeal].length - 1)
                computeTokenAndETHRewards(_disputeID, _appeal);
        }
    }

    /** @dev Executes a specified dispute's ruling. UNTRUSTED.
     *  @param _disputeID The ID of the dispute.
     */
    function executeRuling(uint _disputeID) external onlyDuringPeriod(_disputeID, Period.execution) {
        Dispute storage dispute = disputes[_disputeID];
        require(!dispute.ruled, "Ruling already executed.");
        dispute.ruled = true;
        uint winningChoice = dispute.voteCounters[dispute.voteCounters.length - 1].tied ? 0
            : dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
        dispute.arbitrated.rule(_disputeID, winningChoice);
    }

    /* External Views */

    /** @dev Gets a specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     */
    function getSubcourt(uint96 _subcourtID) external view returns(
        uint96 parent,
        uint[] children,
        bool hiddenVotes,
        uint minStake,
        uint alpha,
        uint jurorFee,
        uint jurorsForJump,
        uint[4] timesPerPeriod
    ) {
        Court storage subcourt = courts[_subcourtID];
        parent = subcourt.parent;
        children = subcourt.children;
        hiddenVotes = subcourt.hiddenVotes;
        minStake = subcourt.minStake;
        alpha = subcourt.alpha;
        jurorFee = subcourt.jurorFee;
        jurorsForJump = subcourt.jurorsForJump;
        timesPerPeriod = subcourt.timesPerPeriod;
    }

    /** @dev Gets a specified vote for a specified appeal in a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     *  @param _voteID The ID of the vote.
     */
    function getVote(uint _disputeID, uint _appeal, uint _voteID) external view returns(
        address account,
        bytes32 commit,
        uint choice,
        bool voted
    ) {
        Vote storage vote = disputes[_disputeID].votes[_appeal][_voteID];
        account = vote.account;
        commit = vote.commit;
        choice = vote.choice;
        voted = vote.voted;
    }

    /** @dev Gets the vote counter for a specified appeal in a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     */
    function getVoteCounter(uint _disputeID, uint _appeal) external view returns(
        uint winningChoice,
        uint[] counts,
        bool tied
    ) {
        VoteCounter storage voteCounter = disputes[_disputeID].voteCounters[_appeal];
        winningChoice = voteCounter.winningChoice;
        counts = voteCounter.counts;
        tied = voteCounter.tied;
    }

    /** @dev Gets a specified dispute's non primitive properties.
     *  @param _disputeID The ID of the dispute.
     */
    function getDispute(uint _disputeID) external view returns(
        uint[] jurorAtStake,
        uint[] totalJurorFees,
        uint[] repartitionsPerRound,
        uint[] penaltiesPerRound,
        uint[] tokenRewardPerRound,
        uint[] ETHRewardPerRound
    ) {
        Dispute storage dispute = disputes[_disputeID];
        jurorAtStake = dispute.jurorAtStake;
        totalJurorFees = dispute.totalJurorFees;
        repartitionsPerRound = dispute.repartitionsPerRound;
        penaltiesPerRound = dispute.penaltiesPerRound;
        for (uint i = 0; i < dispute.rewardsPerRound.length; i++) {
            tokenRewardPerRound[i] = dispute.rewardsPerRound[i][0];
            ETHRewardPerRound[i] = dispute.rewardsPerRound[i][1];
        }
    }

    /** @dev Gets a specified juror.
     *  @param _jurorID The ID of the juror.
     */
    function getJuror(address _jurorID) external view returns(
        uint96[] subcourtIDs,
        uint stakedTokens,
        uint lockedTokens
    ) {
        Juror storage juror = jurors[_jurorID];
        subcourtIDs = juror.subcourtIDs;
        stakedTokens = juror.stakedTokens;
        lockedTokens = juror.lockedTokens;
    }

    /* Public */

    /** @dev Creates a dispute. Must be called by the arbitrable contract.
     *  @param _numberOfChoices Number of choices to choose from in the dispute to be created.
     *  @param _extraData Additional info about the dispute to be created. We use it to pass the ID of the subcourt to create the dispute in.
     *  @return The ID of the created dispute.
     */
    function createDispute(
        uint _numberOfChoices,
        bytes _extraData
    ) public payable requireArbitrationFee(_extraData) returns(uint disputeID)  {
        uint96 subcourtID = extraDataToSubcourtID(_extraData);
        disputeID = disputes.length++;
        Dispute storage dispute = disputes[disputeID];
        dispute.subcourtID = subcourtID;
        dispute.arbitrated = Arbitrable(msg.sender);
        dispute.numberOfChoices = _numberOfChoices;
        dispute.period = Period.evidence;
        dispute.lastPeriodChange = now;
        // As many votes that can be afforded by the provided funds.
        dispute.votes[dispute.votes.length++].length = msg.value / courts[dispute.subcourtID].jurorFee;
        // Add one for choice "0", "refuse to arbitrate"/"no ruling".
        dispute.voteCounters[dispute.voteCounters.length++].counts.length = dispute.numberOfChoices + 1;
        dispute.voteCounters[dispute.voteCounters.length - 1].tied = true;
        dispute.jurorAtStake.push((courts[dispute.subcourtID].minStake * courts[dispute.subcourtID].alpha) / ALPHA_DIVISOR);
        dispute.totalJurorFees.push(msg.value);
        dispute.repartitionsPerRound.push(0);
        dispute.penaltiesPerRound.push(0);
        dispute.rewardsPerRound.length++;
        disputesWithoutJurors++;

        emit DisputeCreation(disputeID, Arbitrable(msg.sender));
    }

    /** @dev Appeal the ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     */
    function appeal(
        uint _disputeID,
        bytes _extraData
    ) public payable requireAppealFee(_disputeID, _extraData) onlyDuringPeriod(_disputeID, Period.appeal) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.votes[dispute.votes.length - 1].length >= courts[dispute.subcourtID].jurorsForJump) // Jump to parent subcourt.
            dispute.subcourtID = courts[dispute.subcourtID].parent;
        dispute.period = Period.evidence;
        dispute.lastPeriodChange = now;
        // As many votes that can be afforded by the provided funds.
        dispute.votes[dispute.votes.length++].length = msg.value / courts[dispute.subcourtID].jurorFee;
        // Add one for choice "0", "refuse to arbitrate"/"no ruling".
        dispute.voteCounters[dispute.voteCounters.length++].counts.length = dispute.numberOfChoices + 1;
        dispute.voteCounters[dispute.voteCounters.length - 1].tied = true;
        dispute.jurorAtStake.push((courts[dispute.subcourtID].minStake * courts[dispute.subcourtID].alpha) / ALPHA_DIVISOR);
        dispute.totalJurorFees.push(msg.value);
        dispute.drawsPerRound = 0;
        dispute.commitsPerRound = 0;
        dispute.votesPerRound = 0;
        dispute.repartitionsPerRound.push(0);
        dispute.penaltiesPerRound.push(0);
        dispute.rewardsPerRound.length++;
        disputesWithoutJurors++;

        emit AppealDecision(_disputeID, Arbitrable(msg.sender));
    }

    /** @dev Called when `_owner` sends ether to the MiniMe Token contract.
     *  @param _owner The address that sent the ether to create tokens.
     *  @return Wether the operation should be allowed or not.
     */
    function proxyPayment(address _owner) public payable returns(bool allowed) { allowed = false; }

    /** @dev Notifies the controller about a token transfer allowing the controller to react if desired.
     *  @param _from The origin of the transfer.
     *  @param _to The destination of the transfer.
     *  @param _amount The amount of the transfer.
     *  @return Wether the operation should be allowed or not.
     */
    function onTransfer(address _from, address _to, uint _amount) public returns(bool allowed) {
        if (_from != address(this) && _to != address(this)) { // Never block penalties or rewards.
            uint newBalance = pinakion.balanceOf(_from) - _amount;
            require(newBalance >= jurors[_from].stakedTokens, "Cannot transfer an amount that would make balance less than stake.");
            require(newBalance >= jurors[_from].lockedTokens, "Cannot transfer an amount that would make balance less than locked stake.");
        }
        allowed = true;
    }

    /** @dev Notifies the controller about an approval allowing the controller to react if desired.
     *  @param _owner The address that calls `approve()`.
     *  @param _spender The spender in the `approve()` call.
     *  @param _amount The amount in the `approve()` call.
     *  @return Wether the operation should be allowed or not.
     */
    function onApprove(address _owner, address _spender, uint _amount) public returns(bool allowed) { allowed = true; }

    /* Public Views */

    /** @dev Get the cost of arbitration in a specified subcourt.
     *  @param _extraData Additional info about the dispute. We use it to pass the ID of the subcourt where the dispute will be created in.
     *  @return The cost.
     */
    function arbitrationCost(bytes _extraData) public view returns(uint cost) {
        uint96 subcourtID = extraDataToSubcourtID(_extraData);
        cost = courts[subcourtID].jurorFee;
    }

    /** @dev Get the cost of appealing a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     *  @return The cost.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
        Dispute storage dispute = disputes[_disputeID];
        uint lastNumberOfJurors = dispute.votes[dispute.votes.length - 1].length;
        if (lastNumberOfJurors >= courts[dispute.subcourtID].jurorsForJump) { // Jump to parent subcourt.
            if (dispute.subcourtID == 0) // Already in the general court.
                cost = NON_PAYABLE_AMOUNT;
            else // Get the cost of the parent subcourt.
                cost = courts[courts[dispute.subcourtID].parent].jurorFee;
        } else // Stay in current subcourt.
            cost = courts[dispute.subcourtID].jurorFee * ((lastNumberOfJurors * 2) + 1);
    }

    /** @dev Get the status of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return The status.
     */
    function disputeStatus(uint _disputeID) public view returns(DisputeStatus status) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period < Period.appeal) status = DisputeStatus.Waiting;
        else if (dispute.period < Period.execution) status = DisputeStatus.Appealable;
        else status = DisputeStatus.Solved;
    }

    /** @dev Get the current ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return The current ruling.
     */
    function currentRuling(uint _disputeID) public view returns(uint ruling) {
        Dispute storage dispute = disputes[_disputeID];
        ruling = dispute.voteCounters[dispute.voteCounters.length - 1].tied ? 0
            : dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
    }

    /* Internal */

    /** @dev Sets the the specified juror's stake in a subcourt.
     *  `O(n + p * log(s))` where `n` is the number of subcourts the juror has staked in, `p` is the depth of the subcourt tree, and `s` is the maximum number of stakers in one of these subcourts.
     *  @param _account The address of the juror.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _stake The new stake.
     */
    function _setStake(address _account, uint96 _subcourtID, uint _stake) internal {
        // Delayed action logic.
        if (phase != Phase.staking) {
            delayedSetStakes[++lastDelayedSetStake] = DelayedSetStake({ account: _account, subcourtID: _subcourtID, stake: _stake });
            return;
        }

        require(
            _stake == 0 || courts[_subcourtID].minStake <= _stake,
            "The juror's stake cannot be lower than the minimum stake for the subcourt."
        );
        Juror storage juror = jurors[_account];
        bytes32 stakePathID = accountAndSubcourtIDToStakePathID(_account, _subcourtID);
        uint currentStake = stakeOf(bytes32(_subcourtID), stakePathID);
        uint newTotalStake = juror.stakedTokens - currentStake + _stake;
        require(
            _stake == 0 || pinakion.balanceOf(_account) >= newTotalStake,
            "The juror's total amount of staked tokens cannot be higher than the juror's balance."
        );

        // Update juror's records.
        juror.stakedTokens = newTotalStake;
        if (_stake == 0) {
            for (uint i = 0; i < juror.subcourtIDs.length; i++)
                if (juror.subcourtIDs[i] == _subcourtID) {
                    juror.subcourtIDs[i] = juror.subcourtIDs[juror.subcourtIDs.length - 1];
                    juror.subcourtIDs.length--;
                    break;
                }
        } else if (currentStake == 0) juror.subcourtIDs.push(_subcourtID);

        // Update subcourt parents.
        bool finished = false;
        uint currentSubcourtID = _subcourtID;
        while (!finished) {
            uint currentSubcourtStake = stakeOf(bytes32(currentSubcourtID), stakePathID);
            if (currentSubcourtStake == 0) append(bytes32(currentSubcourtID), _stake, stakePathID);
            else set(
                bytes32(currentSubcourtID),
                _stake,
                stakePathID
            );
            if (currentSubcourtID == 0) finished = true;
            else currentSubcourtID = courts[currentSubcourtID].parent;
        }
        emit StakeSet(_account, _subcourtID, _stake, newTotalStake);
    }

    /** @dev Get a subcourt ID from the specified extra data bytes array.
     *  @param _extraData The extra data.
     */
    function extraDataToSubcourtID(bytes _extraData) internal view returns (uint96 subcourtID) {
        if (_extraData.length >= 32) {
            assembly { // solium-disable-line security/no-inline-assembly
                subcourtID := mload(add(_extraData, 0x20))
            }
            if (subcourtID >= courts.length) subcourtID = 0;
        } else subcourtID = 0;
    }

    /** @dev Pack an account and a subcourt ID into a stake path ID.
     *  @param _account The account to pack.
     *  @param _subcourtID The subcourt ID to pack.
     *  @return The stake path ID.
     */
    function accountAndSubcourtIDToStakePathID(address _account, uint96 _subcourtID) internal pure returns (bytes32 stakePathID) {
        assembly { // solium-disable-line security/no-inline-assembly
            let ptr := mload(0x40)
            for { let i := 0x00 } lt(i, 0x14) { i := add(i, 0x01) } {
                mstore8(add(ptr, i), byte(add(0x0c, i), _account))
            }
            for { let i := 0x14 } lt(i, 0x20) { i := add(i, 0x01) } {
                mstore8(add(ptr, i), byte(i, _subcourtID))
            }
            stakePathID := mload(ptr)
        }
    }
    
    /** @dev Unpack a stake path ID into an account and a subcourt ID.
     *  @param _stakePathID The stake path ID to unpack.
     *  @return The account and subcourt ID.
     */
    function stakePathIDToAccountAndSubcourtID(bytes32 _stakePathID) internal pure returns (address account, uint96 subcourtID) {
        assembly { // solium-disable-line security/no-inline-assembly
            let ptr := mload(0x40)
            for { let i := 0x00 } lt(i, 0x14) { i := add(i, 0x01) } {
                mstore8(add(add(ptr, 0x0c), i), byte(i, _stakePathID))
            }
            account := mload(ptr)
            subcourtID := _stakePathID
        }
    }
}
