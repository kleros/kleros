/**
 *  https://contributing.kleros.io/smart-contract-workflow
 *  @authors: [@epiqueras]
 *  @reviewers: [@clesaege, @unknownunknown1, @ferittuncer, @remedcu, @satello, @fnanni-0, @shalzz, @MerlinEgalite]
 *  @auditors: []
 *  @bounties: [{ duration: 14 days, link: https://github.com/kleros/kleros/issues/117, maxPayout: 50 ETH }]
 *  @deployments: [ https://etherscan.io/address/0x988b3a538b618c7a603e1c11ab82cd16dbe28069 ]
 */
/* solium-disable error-reason */
/* solium-disable security/no-block-members */
pragma solidity ^0.4.24;

import { TokenController } from "minimetoken/contracts/TokenController.sol";
import { Arbitrator, Arbitrable } from "@kleros/kleros-interaction/contracts/standard/arbitration/Arbitrator.sol";
import { MiniMeTokenERC20 as Pinakion } from "@kleros/kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";
import { RNG } from "@kleros/kleros-interaction/contracts/standard/rng/RNG.sol";

import { SortitionSumTreeFactory } from "../data-structures/SortitionSumTreeFactory.sol";

/**
 *  @title KlerosLiquid
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev The main Kleros contract with dispute resolution logic for the Athena release.
 *  This is the contract currently used on mainnet.
 */
contract KlerosLiquid is TokenController, Arbitrator {
    /* Enums */

    // General
    enum Phase {
      staking, // Stake sum trees can be updated. Pass after `minStakingTime` passes and there is at least one dispute without jurors.
      generating, // Waiting for a random number. Pass as soon as it is ready.
      drawing // Jurors can be drawn. Pass after all disputes have jurors or `maxDrawingTime` passes.
    }

    // Dispute
    enum Period {
      evidence, // Evidence can be submitted. This is also when drawing has to take place.
      commit, // Jurors commit a hashed vote. This is skipped for courts without hidden votes.
      vote, // Jurors reveal/cast their vote depending on whether the court has hidden votes or not.
      appeal, // The dispute can be appealed.
      execution // Tokens are redistributed and the ruling is executed.
    }

    /* Structs */

    // General
    struct Court {
        uint96 parent; // The parent court.
        uint[] children; // List of child courts.
        bool hiddenVotes; // Whether to use commit and reveal or not.
        uint minStake; // Minimum tokens needed to stake in the court.
        uint alpha; // Basis point of tokens that are lost when incoherent.
        uint feeForJuror; // Arbitration fee paid per juror.
        // The appeal after the one that reaches this number of jurors will go to the parent court if any, otherwise, no more appeals are possible.
        uint jurorsForCourtJump;
        uint[4] timesPerPeriod; // The time allotted to each dispute period in the form `timesPerPeriod[period]`.
    }
    struct DelayedSetStake {
        address account; // The address of the juror.
        uint96 subcourtID; // The ID of the subcourt.
        uint128 stake; // The new stake.
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
        mapping(uint => uint) counts; // The sum of votes for each choice in the form `counts[choice]`.
        bool tied; // True if there is a tie, false otherwise.
    }
    struct Dispute { // Note that appeal `0` is equivalent to the first round of the dispute.
        uint96 subcourtID; // The ID of the subcourt the dispute is in.
        Arbitrable arbitrated; // The arbitrated arbitrable contract.
        // The number of choices jurors have when voting. This does not include choice `0` which is reserved for "refuse to arbitrate"/"no ruling".
        uint numberOfChoices;
        Period period; // The current period of the dispute.
        uint lastPeriodChange; // The last time the period was changed.
        // The votes in the form `votes[appeal][voteID]`. On each round, a new list is pushed and packed with as many empty votes as there are draws. We use `dispute.votes.length` to get the number of appeals plus 1 for the first round.
        Vote[][] votes;
        VoteCounter[] voteCounters; // The vote counters in the form `voteCounters[appeal]`.
        uint[] tokensAtStakePerJuror; // The amount of tokens at stake for each juror in the form `tokensAtStakePerJuror[appeal]`.
        uint[] totalFeesForJurors; // The total juror fees paid in the form `totalFeesForJurors[appeal]`.
        uint drawsInRound; // A counter of draws made in the current round.
        uint commitsInRound; // A counter of commits made in the current round.
        uint[] votesInEachRound; // A counter of votes made in each round in the form `votesInEachRound[appeal]`.
        // A counter of vote reward repartitions made in each round in the form `repartitionsInEachRound[appeal]`.
        uint[] repartitionsInEachRound;
        uint[] penaltiesInEachRound; // The amount of tokens collected from penalties in each round in the form `penaltiesInEachRound[appeal]`.
        bool ruled; // True if the ruling has been executed, false otherwise.
    }

    // Juror
    struct Juror {
        // The IDs of subcourts where the juror has stake path ends. A stake path is a path from the general court to a court the juror directly staked in using `_setStake`.
        uint96[] subcourtIDs;
        uint stakedTokens; // The juror's total amount of tokens staked in subcourts.
        uint lockedTokens; // The juror's total amount of tokens locked in disputes.
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
    event StakeSet(address indexed _address, uint _subcourtID, uint128 _stake, uint _newTotalStake);

    /** @dev Emitted when a juror is drawn.
     *  @param _address The drawn address.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal the draw is for. 0 is for the first round.
     *  @param _voteID The vote ID.
     */
    event Draw(address indexed _address, uint indexed _disputeID, uint _appeal, uint _voteID);

    /** @dev Emitted when a juror wins or loses tokens and ETH from a dispute.
     *  @param _address The juror affected.
     *  @param _disputeID The ID of the dispute.
     *  @param _tokenAmount The amount of tokens won or lost.
     *  @param _ETHAmount The amount of ETH won or lost.
     */
    event TokenAndETHShift(address indexed _address, uint indexed _disputeID, int _tokenAmount, int _ETHAmount);

    /* Storage */

    // General Constants
    uint public constant MAX_STAKE_PATHS = 4; // The maximum number of stake paths a juror can have.
    uint public constant MIN_JURORS = 3; // The global default minimum number of jurors in a dispute.
    uint public constant NON_PAYABLE_AMOUNT = (2 ** 256 - 2) / 2; // An amount higher than the supply of ETH.
    uint public constant ALPHA_DIVISOR = 1e4; // The number to divide `Court.alpha` by.
    // General Contracts
    address public governor; // The governor of the contract.
    Pinakion public pinakion; // The Pinakion token contract.
    RNG public RNGenerator; // The random number generator contract.
    // General Dynamic
    Phase public phase; // The current phase.
    uint public lastPhaseChange; // The last time the phase was changed.
    uint public disputesWithoutJurors; // The number of disputes that have not finished drawing jurors.
    // The block number to get the next random number from. Used so there is at least a 1 block difference from the staking phase.
    uint public RNBlock;
    uint public RN; // The current random number.
    uint public minStakingTime; // The minimum staking time.
    uint public maxDrawingTime; // The maximum drawing time.
    // True if insolvent (`balance < stakedTokens || balance < lockedTokens`) token transfers should be blocked. Used to avoid blocking penalties.
    bool public lockInsolventTransfers = true;
    // General Storage
    Court[] public courts; // The subcourts.
    using SortitionSumTreeFactory for SortitionSumTreeFactory.SortitionSumTrees; // Use library functions for sortition sum trees.
    SortitionSumTreeFactory.SortitionSumTrees internal sortitionSumTrees; // The sortition sum trees.
    // The delayed calls to `_setStake`. Used to schedule `_setStake`s when not in the staking phase.
    mapping(uint => DelayedSetStake) public delayedSetStakes;
    // The index of the next `delayedSetStakes` item to execute. Starts at 1 because `lastDelayedSetStake` starts at 0.
    uint public nextDelayedSetStake = 1;
    uint public lastDelayedSetStake; // The index of the last `delayedSetStakes` item. 0 is skipped because it is the initial value.

    // Dispute
    Dispute[] public disputes; // The disputes.

    // Juror
    mapping(address => Juror) public jurors; // The jurors.

    /* Modifiers */

    /** @dev Requires a specific phase.
     *  @param _phase The required phase.
     */
    modifier onlyDuringPhase(Phase _phase) {require(phase == _phase); _;}

    /** @dev Requires a specific period in a dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _period The required period.
     */
    modifier onlyDuringPeriod(uint _disputeID, Period _period) {require(disputes[_disputeID].period == _period); _;}

    /** @dev Requires that the sender is the governor. Note that the governor is expected to not be malicious. */
    modifier onlyByGovernor() {require(governor == msg.sender); _;}

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
     *  @param _feeForJuror The `feeForJuror` property value of the general court.
     *  @param _jurorsForCourtJump The `jurorsForCourtJump` property value of the general court.
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
        uint _feeForJuror,
        uint _jurorsForCourtJump,
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
            feeForJuror: _feeForJuror,
            jurorsForCourtJump: _jurorsForCourtJump,
            timesPerPeriod: _timesPerPeriod
        }));
        sortitionSumTrees.createTree(bytes32(0), _sortitionSumTreeK);
    }

    /* External */

    /** @dev Lets the governor call anything on behalf of the contract.
     *  @param _destination The destination of the call.
     *  @param _amount The value sent with the call.
     *  @param _data The data sent with the call.
     */
    function executeGovernorProposal(address _destination, uint _amount, bytes _data) external onlyByGovernor {
        require(_destination.call.value(_amount)(_data)); // solium-disable-line security/no-call-value
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
        if (phase == Phase.generating) {
            RNBlock = block.number + 1;
            RNGenerator.requestRN(RNBlock);
        }
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
     *  @param _feeForJuror The `feeForJuror` property value of the subcourt.
     *  @param _jurorsForCourtJump The `jurorsForCourtJump` property value of the subcourt.
     *  @param _timesPerPeriod The `timesPerPeriod` property value of the subcourt.
     *  @param _sortitionSumTreeK The number of children per node of the subcourt's sortition sum tree.
     */
    function createSubcourt(
        uint96 _parent,
        bool _hiddenVotes,
        uint _minStake,
        uint _alpha,
        uint _feeForJuror,
        uint _jurorsForCourtJump,
        uint[4] _timesPerPeriod,
        uint _sortitionSumTreeK
    ) external onlyByGovernor {
        require(courts[_parent].minStake <= _minStake, "A subcourt cannot be a child of a subcourt with a higher minimum stake.");

        // Create the subcourt.
        uint96 subcourtID = uint96(
            courts.push(Court({
                parent: _parent,
                children: new uint[](0),
                hiddenVotes: _hiddenVotes,
                minStake: _minStake,
                alpha: _alpha,
                feeForJuror: _feeForJuror,
                jurorsForCourtJump: _jurorsForCourtJump,
                timesPerPeriod: _timesPerPeriod
            })) - 1
        );
        sortitionSumTrees.createTree(bytes32(subcourtID), _sortitionSumTreeK);

        // Update the parent.
        courts[_parent].children.push(subcourtID);
    }

    /** @dev Changes the `minStake` property value of a specified subcourt. Don't set to a value lower than its parent's `minStake` property value.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _minStake The new value for the `minStake` property value.
     */
    function changeSubcourtMinStake(uint96 _subcourtID, uint _minStake) external onlyByGovernor {
        require(_subcourtID == 0 || courts[courts[_subcourtID].parent].minStake <= _minStake);
        for (uint i = 0; i < courts[_subcourtID].children.length; i++) {
            require(
                courts[courts[_subcourtID].children[i]].minStake >= _minStake,
                "A subcourt cannot be the parent of a subcourt with a lower minimum stake."
            );
        }

        courts[_subcourtID].minStake = _minStake;
    }

    /** @dev Changes the `alpha` property value of a specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _alpha The new value for the `alpha` property value.
     */
    function changeSubcourtAlpha(uint96 _subcourtID, uint _alpha) external onlyByGovernor {
        courts[_subcourtID].alpha = _alpha;
    }

    /** @dev Changes the `feeForJuror` property value of a specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _feeForJuror The new value for the `feeForJuror` property value.
     */
    function changeSubcourtJurorFee(uint96 _subcourtID, uint _feeForJuror) external onlyByGovernor {
        courts[_subcourtID].feeForJuror = _feeForJuror;
    }

    /** @dev Changes the `jurorsForCourtJump` property value of a specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _jurorsForCourtJump The new value for the `jurorsForCourtJump` property value.
     */
    function changeSubcourtJurorsForJump(uint96 _subcourtID, uint _jurorsForCourtJump) external onlyByGovernor {
        courts[_subcourtID].jurorsForCourtJump = _jurorsForCourtJump;
    }

    /** @dev Changes the `timesPerPeriod` property value of a specified subcourt.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _timesPerPeriod The new value for the `timesPerPeriod` property value.
     */
    function changeSubcourtTimesPerPeriod(uint96 _subcourtID, uint[4] _timesPerPeriod) external onlyByGovernor {
        courts[_subcourtID].timesPerPeriod = _timesPerPeriod;
    }

    /** @dev Passes the phase. TRUSTED */
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

    /** @dev Passes the period of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     */
    function passPeriod(uint _disputeID) external {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period == Period.evidence) {
            require(
                dispute.votes.length > 1 || now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)],
                "The evidence period time has not passed yet and it is not an appeal."
            );
            require(dispute.drawsInRound == dispute.votes[dispute.votes.length - 1].length, "The dispute has not finished drawing yet.");
            dispute.period = courts[dispute.subcourtID].hiddenVotes ? Period.commit : Period.vote;
        } else if (dispute.period == Period.commit) {
            require(
                now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.commitsInRound == dispute.votes[dispute.votes.length - 1].length,
                "The commit period time has not passed yet and not every juror has committed yet."
            );
            dispute.period = Period.vote;
        } else if (dispute.period == Period.vote) {
            require(
                now - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.votesInEachRound[dispute.votes.length - 1] == dispute.votes[dispute.votes.length - 1].length,
                "The vote period time has not passed yet and not every juror has voted yet."
            );
            dispute.period = Period.appeal;
            emit AppealPossible(_disputeID, dispute.arbitrated);
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
        require(_setStake(msg.sender, _subcourtID, _stake));
    }

    /** @dev Executes the next delayed set stakes.
     *  @param _iterations The number of delayed set stakes to execute.
     */
    function executeDelayedSetStakes(uint _iterations) external onlyDuringPhase(Phase.staking) {
        uint actualIterations = (nextDelayedSetStake + _iterations) - 1 > lastDelayedSetStake ?
            (lastDelayedSetStake - nextDelayedSetStake) + 1 : _iterations;
        uint newNextDelayedSetStake = nextDelayedSetStake + actualIterations;
        require(newNextDelayedSetStake >= nextDelayedSetStake);
        for (uint i = nextDelayedSetStake; i < newNextDelayedSetStake; i++) {
            DelayedSetStake storage delayedSetStake = delayedSetStakes[i];
            _setStake(delayedSetStake.account, delayedSetStake.subcourtID, delayedSetStake.stake);
            delete delayedSetStakes[i];
        }
        nextDelayedSetStake = newNextDelayedSetStake;
    }

    /** @dev Draws jurors for a dispute. Can be called in parts.
     *  `O(n * k * log_k(j))` where
     *  `n` is the number of iterations to run,
     *  `k` is the number of children per node of the dispute's court's sortition sum tree,
     *  and `j` is the maximum number of jurors that ever staked in it simultaneously.
     *  @param _disputeID The ID of the dispute.
     *  @param _iterations The number of iterations to run.
     */
    function drawJurors(
        uint _disputeID,
        uint _iterations
    ) external onlyDuringPhase(Phase.drawing) onlyDuringPeriod(_disputeID, Period.evidence) {
        Dispute storage dispute = disputes[_disputeID];
        uint endIndex = dispute.drawsInRound + _iterations;
        require(endIndex >= dispute.drawsInRound);

        // Avoid going out of range.
        if (endIndex > dispute.votes[dispute.votes.length - 1].length) endIndex = dispute.votes[dispute.votes.length - 1].length;
        for (uint i = dispute.drawsInRound; i < endIndex; i++) {
            // Draw from sortition tree.
            (
                address drawnAddress,
                uint subcourtID
            ) = stakePathIDToAccountAndSubcourtID(sortitionSumTrees.draw(bytes32(dispute.subcourtID), uint(keccak256(RN, _disputeID, i))));

            // Save the vote.
            dispute.votes[dispute.votes.length - 1][i].account = drawnAddress;
            jurors[drawnAddress].lockedTokens += dispute.tokensAtStakePerJuror[dispute.tokensAtStakePerJuror.length - 1];
            emit Draw(drawnAddress, _disputeID, dispute.votes.length - 1, i);

            // If dispute is fully drawn.
            if (i == dispute.votes[dispute.votes.length - 1].length - 1) disputesWithoutJurors--;
        }
        dispute.drawsInRound = endIndex;
    }

    /** @dev Sets the caller's commit for the specified votes.
     *  `O(n)` where
     *  `n` is the number of votes.
     *  @param _disputeID The ID of the dispute.
     *  @param _voteIDs The IDs of the votes.
     *  @param _commit The commit.
     */
    function castCommit(uint _disputeID, uint[] _voteIDs, bytes32 _commit) external onlyDuringPeriod(_disputeID, Period.commit) {
        Dispute storage dispute = disputes[_disputeID];
        require(_commit != bytes32(0));
        for (uint i = 0; i < _voteIDs.length; i++) {
            require(dispute.votes[dispute.votes.length - 1][_voteIDs[i]].account == msg.sender, "The caller has to own the vote.");
            require(dispute.votes[dispute.votes.length - 1][_voteIDs[i]].commit == bytes32(0), "Already committed this vote.");
            dispute.votes[dispute.votes.length - 1][_voteIDs[i]].commit = _commit;
        }
        dispute.commitsInRound += _voteIDs.length;
    }

    /** @dev Sets the caller's choices for the specified votes.
     *  `O(n)` where
     *  `n` is the number of votes.
     *  @param _disputeID The ID of the dispute.
     *  @param _voteIDs The IDs of the votes.
     *  @param _choice The choice.
     *  @param _salt The salt for the commit if the votes were hidden.
     */
    function castVote(uint _disputeID, uint[] _voteIDs, uint _choice, uint _salt) external onlyDuringPeriod(_disputeID, Period.vote) {
        Dispute storage dispute = disputes[_disputeID];
        require(_voteIDs.length > 0);
        require(_choice <= dispute.numberOfChoices, "The choice has to be less than or equal to the number of choices for the dispute.");

        // Save the votes.
        for (uint i = 0; i < _voteIDs.length; i++) {
            require(dispute.votes[dispute.votes.length - 1][_voteIDs[i]].account == msg.sender, "The caller has to own the vote.");
            require(
                !courts[dispute.subcourtID].hiddenVotes || dispute.votes[dispute.votes.length - 1][_voteIDs[i]].commit == keccak256(_choice, _salt),
                "The commit must match the choice in subcourts with hidden votes."
            );
            require(!dispute.votes[dispute.votes.length - 1][_voteIDs[i]].voted, "Vote already cast.");
            dispute.votes[dispute.votes.length - 1][_voteIDs[i]].choice = _choice;
            dispute.votes[dispute.votes.length - 1][_voteIDs[i]].voted = true;
        }
        dispute.votesInEachRound[dispute.votes.length - 1] += _voteIDs.length;

        // Update winning choice.
        VoteCounter storage voteCounter = dispute.voteCounters[dispute.voteCounters.length - 1];
        voteCounter.counts[_choice] += _voteIDs.length;
        if (_choice == voteCounter.winningChoice) { // Voted for the winning choice.
            if (voteCounter.tied) voteCounter.tied = false; // Potentially broke tie.
        } else { // Voted for another choice.
            if (voteCounter.counts[_choice] == voteCounter.counts[voteCounter.winningChoice]) { // Tie.
                if (!voteCounter.tied) voteCounter.tied = true;
            } else if (voteCounter.counts[_choice] > voteCounter.counts[voteCounter.winningChoice]) { // New winner.
                voteCounter.winningChoice = _choice;
                voteCounter.tied = false;
            }
        }
    }

    /** @dev Computes the token and ETH rewards for a specified appeal in a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     *  @return tokenReward The token reward.
     *  @return ETHReward The ETH reward.
     */
    function computeTokenAndETHRewards(uint _disputeID, uint _appeal) private view returns(uint tokenReward, uint ETHReward) {
        Dispute storage dispute = disputes[_disputeID];

        // Distribute penalties and arbitration fees.
        if (dispute.voteCounters[dispute.voteCounters.length - 1].tied) {
            // Distribute penalties and fees evenly between active jurors.
            uint activeCount = dispute.votesInEachRound[_appeal];
            if (activeCount > 0) {
                tokenReward = dispute.penaltiesInEachRound[_appeal] / activeCount;
                ETHReward = dispute.totalFeesForJurors[_appeal] / activeCount;
            } else {
                tokenReward = 0;
                ETHReward = 0;
            }
        } else {
            // Distribute penalties and fees evenly between coherent jurors.
            uint winningChoice = dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
            uint coherentCount = dispute.voteCounters[_appeal].counts[winningChoice];
            tokenReward = dispute.penaltiesInEachRound[_appeal] / coherentCount;
            ETHReward = dispute.totalFeesForJurors[_appeal] / coherentCount;
        }
    }

    /** @dev Repartitions tokens and ETH for a specified appeal in a specified dispute. Can be called in parts.
     *  `O(i + u * n * (n + p * log_k(j)))` where
     *  `i` is the number of iterations to run,
     *  `u` is the number of jurors that need to be unstaked,
     *  `n` is the maximum number of subcourts one of these jurors has staked in,
     *  `p` is the depth of the subcourt tree,
     *  `k` is the minimum number of children per node of one of these subcourts' sortition sum tree,
     *  and `j` is the maximum number of jurors that ever staked in one of these subcourts simultaneously.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     *  @param _iterations The number of iterations to run.
     */
    function execute(uint _disputeID, uint _appeal, uint _iterations) external onlyDuringPeriod(_disputeID, Period.execution) {
        lockInsolventTransfers = false;
        Dispute storage dispute = disputes[_disputeID];
        uint end = dispute.repartitionsInEachRound[_appeal] + _iterations;
        require(end >= dispute.repartitionsInEachRound[_appeal]);
        uint penaltiesInRoundCache = dispute.penaltiesInEachRound[_appeal]; // For saving gas.
        (uint tokenReward, uint ETHReward) = (0, 0);

        // Avoid going out of range.
        if (
            !dispute.voteCounters[dispute.voteCounters.length - 1].tied &&
            dispute.voteCounters[_appeal].counts[dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice] == 0
        ) {
            // We loop over the votes once as there are no rewards because it is not a tie and no one in this round is coherent with the final outcome.
            if (end > dispute.votes[_appeal].length) end = dispute.votes[_appeal].length;
        } else {
            // We loop over the votes twice, first to collect penalties, and second to distribute them as rewards along with arbitration fees.
            (tokenReward, ETHReward) = dispute.repartitionsInEachRound[_appeal] >= dispute.votes[_appeal].length ? computeTokenAndETHRewards(_disputeID, _appeal) : (0, 0); // Compute rewards if rewarding.
            if (end > dispute.votes[_appeal].length * 2) end = dispute.votes[_appeal].length * 2;
        }
        for (uint i = dispute.repartitionsInEachRound[_appeal]; i < end; i++) {
            Vote storage vote = dispute.votes[_appeal][i % dispute.votes[_appeal].length];
            if (
                vote.voted &&
                (vote.choice == dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice || dispute.voteCounters[dispute.voteCounters.length - 1].tied)
            ) { // Juror was active, and voted coherently or it was a tie.
                if (i >= dispute.votes[_appeal].length) { // Only execute in the second half of the iterations.

                    // Reward.
                    pinakion.transfer(vote.account, tokenReward);
                    // Intentional use to avoid blocking.
                    vote.account.send(ETHReward); // solium-disable-line security/no-send
                    emit TokenAndETHShift(vote.account, _disputeID, int(tokenReward), int(ETHReward));
                    jurors[vote.account].lockedTokens -= dispute.tokensAtStakePerJuror[_appeal];
                }
            } else { // Juror was inactive, or voted incoherently and it was not a tie.
                if (i < dispute.votes[_appeal].length) { // Only execute in the first half of the iterations.

                    // Penalize.
                    uint penalty = dispute.tokensAtStakePerJuror[_appeal] > pinakion.balanceOf(vote.account) ? pinakion.balanceOf(vote.account) : dispute.tokensAtStakePerJuror[_appeal];
                    pinakion.transferFrom(vote.account, this, penalty);
                    emit TokenAndETHShift(vote.account, _disputeID, -int(penalty), 0);
                    penaltiesInRoundCache += penalty;
                    jurors[vote.account].lockedTokens -= dispute.tokensAtStakePerJuror[_appeal];

                    // Unstake juror if his penalty made balance less than his total stake or if he lost due to inactivity.
                    if (pinakion.balanceOf(vote.account) < jurors[vote.account].stakedTokens || !vote.voted)
                        for (uint j = 0; j < jurors[vote.account].subcourtIDs.length; j++)
                            _setStake(vote.account, jurors[vote.account].subcourtIDs[j], 0);

                }
            }
            if (i == dispute.votes[_appeal].length - 1) {
                // Send fees and tokens to the governor if no one was coherent.
                if (dispute.votesInEachRound[_appeal] == 0 || !dispute.voteCounters[dispute.voteCounters.length - 1].tied && dispute.voteCounters[_appeal].counts[dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice] == 0) {
                    // Intentional use to avoid blocking.
                    governor.send(dispute.totalFeesForJurors[_appeal]); // solium-disable-line security/no-send
                    pinakion.transfer(governor, penaltiesInRoundCache);
                } else if (i + 1 < end) {
                    // Compute rewards because we are going into rewarding.
                    dispute.penaltiesInEachRound[_appeal] = penaltiesInRoundCache;
                    (tokenReward, ETHReward) = computeTokenAndETHRewards(_disputeID, _appeal);
                }
            }
        }
        if (dispute.penaltiesInEachRound[_appeal] != penaltiesInRoundCache) dispute.penaltiesInEachRound[_appeal] = penaltiesInRoundCache;
        dispute.repartitionsInEachRound[_appeal] = end;
        lockInsolventTransfers = true;
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

    /* Public */

    /** @dev Creates a dispute. Must be called by the arbitrable contract.
     *  @param _numberOfChoices Number of choices to choose from in the dispute to be created.
     *  @param _extraData Additional info about the dispute to be created. We use it to pass the ID of the subcourt to create the dispute in (first 32 bytes) and the minimum number of jurors required (next 32 bytes).
     *  @return disputeID The ID of the created dispute.
     */
    function createDispute(
        uint _numberOfChoices,
        bytes _extraData
    ) public payable requireArbitrationFee(_extraData) returns(uint disputeID)  {
        (uint96 subcourtID, uint minJurors) = extraDataToSubcourtIDAndMinJurors(_extraData);
        disputeID = disputes.length++;
        Dispute storage dispute = disputes[disputeID];
        dispute.subcourtID = subcourtID;
        dispute.arbitrated = Arbitrable(msg.sender);
        dispute.numberOfChoices = _numberOfChoices;
        dispute.period = Period.evidence;
        dispute.lastPeriodChange = now;
        // As many votes that can be afforded by the provided funds.
        dispute.votes[dispute.votes.length++].length = msg.value / courts[dispute.subcourtID].feeForJuror;
        dispute.voteCounters[dispute.voteCounters.length++].tied = true;
        dispute.tokensAtStakePerJuror.push((courts[dispute.subcourtID].minStake * courts[dispute.subcourtID].alpha) / ALPHA_DIVISOR);
        dispute.totalFeesForJurors.push(msg.value);
        dispute.votesInEachRound.push(0);
        dispute.repartitionsInEachRound.push(0);
        dispute.penaltiesInEachRound.push(0);
        disputesWithoutJurors++;

        emit DisputeCreation(disputeID, Arbitrable(msg.sender));
    }

    /** @dev Appeals the ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal. Not used by this contract.
     */
    function appeal(
        uint _disputeID,
        bytes _extraData
    ) public payable requireAppealFee(_disputeID, _extraData) onlyDuringPeriod(_disputeID, Period.appeal) {
        Dispute storage dispute = disputes[_disputeID];
        require(
            msg.sender == address(dispute.arbitrated),
            "Can only be called by the arbitrable contract."
        );
        if (dispute.votes[dispute.votes.length - 1].length >= courts[dispute.subcourtID].jurorsForCourtJump) // Jump to parent subcourt.
            dispute.subcourtID = courts[dispute.subcourtID].parent;
        dispute.period = Period.evidence;
        dispute.lastPeriodChange = now;
        // As many votes that can be afforded by the provided funds.
        dispute.votes[dispute.votes.length++].length = msg.value / courts[dispute.subcourtID].feeForJuror;
        dispute.voteCounters[dispute.voteCounters.length++].tied = true;
        dispute.tokensAtStakePerJuror.push((courts[dispute.subcourtID].minStake * courts[dispute.subcourtID].alpha) / ALPHA_DIVISOR);
        dispute.totalFeesForJurors.push(msg.value);
        dispute.drawsInRound = 0;
        dispute.commitsInRound = 0;
        dispute.votesInEachRound.push(0);
        dispute.repartitionsInEachRound.push(0);
        dispute.penaltiesInEachRound.push(0);
        disputesWithoutJurors++;

        emit AppealDecision(_disputeID, Arbitrable(msg.sender));
        emit NewPeriod(_disputeID, Period.evidence);
    }

    /** @dev Called when `_owner` sends ether to the MiniMe Token contract.
     *  @param _owner The address that sent the ether to create tokens.
     *  @return allowed Whether the operation should be allowed or not.
     */
    function proxyPayment(address _owner) public payable returns(bool allowed) { allowed = false; }

    /** @dev Notifies the controller about a token transfer allowing the controller to react if desired.
     *  @param _from The origin of the transfer.
     *  @param _to The destination of the transfer.
     *  @param _amount The amount of the transfer.
     *  @return allowed Whether the operation should be allowed or not.
     */
    function onTransfer(address _from, address _to, uint _amount) public returns(bool allowed) {
        if (lockInsolventTransfers) { // Never block penalties or rewards.
            uint newBalance = pinakion.balanceOf(_from) - _amount;
            if (newBalance < jurors[_from].stakedTokens || newBalance < jurors[_from].lockedTokens) return false;
        }
        allowed = true;
    }

    /** @dev Notifies the controller about an approval allowing the controller to react if desired.
     *  @param _owner The address that calls `approve()`.
     *  @param _spender The spender in the `approve()` call.
     *  @param _amount The amount in the `approve()` call.
     *  @return allowed Whether the operation should be allowed or not.
     */
    function onApprove(address _owner, address _spender, uint _amount) public returns(bool allowed) { allowed = true; }

    /* Public Views */

    /** @dev Gets the cost of arbitration in a specified subcourt.
     *  @param _extraData Additional info about the dispute. We use it to pass the ID of the subcourt to create the dispute in (first 32 bytes) and the minimum number of jurors required (next 32 bytes).
     *  @return cost The cost.
     */
    function arbitrationCost(bytes _extraData) public view returns(uint cost) {
        (uint96 subcourtID, uint minJurors) = extraDataToSubcourtIDAndMinJurors(_extraData);
        cost = courts[subcourtID].feeForJuror * minJurors;
    }

    /** @dev Gets the cost of appealing a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal. Not used by this contract.
     *  @return cost The cost.
     */
    function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
        Dispute storage dispute = disputes[_disputeID];
        uint lastNumberOfJurors = dispute.votes[dispute.votes.length - 1].length;
        if (lastNumberOfJurors >= courts[dispute.subcourtID].jurorsForCourtJump) { // Jump to parent subcourt.
            if (dispute.subcourtID == 0) // Already in the general court.
                cost = NON_PAYABLE_AMOUNT;
            else // Get the cost of the parent subcourt.
                cost = courts[courts[dispute.subcourtID].parent].feeForJuror * ((lastNumberOfJurors * 2) + 1);
        } else // Stay in current subcourt.
            cost = courts[dispute.subcourtID].feeForJuror * ((lastNumberOfJurors * 2) + 1);
    }

    /** @dev Gets the start and end of a specified dispute's current appeal period.
     *  @param _disputeID The ID of the dispute.
     *  @return start The start of the appeal period.
     *  @return end The end of the appeal period.
     */
    function appealPeriod(uint _disputeID) public view returns(uint start, uint end) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period == Period.appeal) {
            start = dispute.lastPeriodChange;
            end = dispute.lastPeriodChange + courts[dispute.subcourtID].timesPerPeriod[uint(Period.appeal)];
        } else {
            start = 0;
            end = 0;
        }
    }

    /** @dev Gets the status of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return status The status.
     */
    function disputeStatus(uint _disputeID) public view returns(DisputeStatus status) {
        Dispute storage dispute = disputes[_disputeID];
        if (dispute.period < Period.appeal) status = DisputeStatus.Waiting;
        else if (dispute.period < Period.execution) status = DisputeStatus.Appealable;
        else status = DisputeStatus.Solved;
    }

    /** @dev Gets the current ruling of a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @return ruling The current ruling.
     */
    function currentRuling(uint _disputeID) public view returns(uint ruling) {
        Dispute storage dispute = disputes[_disputeID];
        ruling = dispute.voteCounters[dispute.voteCounters.length - 1].tied ? 0
            : dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
    }

    /* Internal */

    /** @dev Sets the specified juror's stake in a subcourt.
     *  `O(n + p * log_k(j))` where
     *  `n` is the number of subcourts the juror has staked in,
     *  `p` is the depth of the subcourt tree,
     *  `k` is the minimum number of children per node of one of these subcourts' sortition sum tree,
     *  and `j` is the maximum number of jurors that ever staked in one of these subcourts simultaneously.
     *  @param _account The address of the juror.
     *  @param _subcourtID The ID of the subcourt.
     *  @param _stake The new stake.
     *  @return succeeded True if the call succeeded, false otherwise.
     */
    function _setStake(address _account, uint96 _subcourtID, uint128 _stake) internal returns(bool succeeded) {
        if (!(_subcourtID < courts.length))
            return false;

        // Delayed action logic.
        if (phase != Phase.staking) {
            delayedSetStakes[++lastDelayedSetStake] = DelayedSetStake({ account: _account, subcourtID: _subcourtID, stake: _stake });
            return true;
        }

        if (!(_stake == 0 || courts[_subcourtID].minStake <= _stake))
            return false; // The juror's stake cannot be lower than the minimum stake for the subcourt.
        Juror storage juror = jurors[_account];
        bytes32 stakePathID = accountAndSubcourtIDToStakePathID(_account, _subcourtID);
        uint currentStake = sortitionSumTrees.stakeOf(bytes32(_subcourtID), stakePathID);
        if (!(_stake == 0 || currentStake > 0 || juror.subcourtIDs.length < MAX_STAKE_PATHS))
            return false; // Maximum stake paths reached.
        uint newTotalStake = juror.stakedTokens - currentStake + _stake; // Can't overflow because _stake is a uint128.
        if (!(_stake == 0 || pinakion.balanceOf(_account) >= newTotalStake))
            return false; // The juror's total amount of staked tokens cannot be higher than the juror's balance.

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
            sortitionSumTrees.set(bytes32(currentSubcourtID), _stake, stakePathID);
            if (currentSubcourtID == 0) finished = true;
            else currentSubcourtID = courts[currentSubcourtID].parent;
        }
        emit StakeSet(_account, _subcourtID, _stake, newTotalStake);
        return true;
    }

    /** @dev Gets a subcourt ID and the minimum number of jurors required from a specified extra data bytes array.
     *  @param _extraData The extra data bytes array. The first 32 bytes are the subcourt ID and the next 32 bytes are the minimum number of jurors.
     *  @return subcourtID The subcourt ID.
     *  @return minJurors The minimum number of jurors required.
     */
    function extraDataToSubcourtIDAndMinJurors(bytes _extraData) internal view returns (uint96 subcourtID, uint minJurors) {
        if (_extraData.length >= 64) {
            assembly { // solium-disable-line security/no-inline-assembly
                subcourtID := mload(add(_extraData, 0x20))
                minJurors := mload(add(_extraData, 0x40))
            }
            if (subcourtID >= courts.length) subcourtID = 0;
            if (minJurors == 0) minJurors = MIN_JURORS;
        } else {
            subcourtID = 0;
            minJurors = MIN_JURORS;
        }
    }

    /** @dev Packs an account and a subcourt ID into a stake path ID.
     *  @param _account The account to pack.
     *  @param _subcourtID The subcourt ID to pack.
     *  @return stakePathID The stake path ID.
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

    /** @dev Unpacks a stake path ID into an account and a subcourt ID.
     *  @param _stakePathID The stake path ID to unpack.
     *  @return account The account.
     *  @return subcourtID The subcourt ID.
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

    /* Interface Views */

    /** @dev Gets a specified subcourt's non primitive properties.
     *  @param _subcourtID The ID of the subcourt.
     *  @return children The subcourt's child court list.
     *  @return timesPerPeriod The subcourt's time per period.
     */
    function getSubcourt(uint96 _subcourtID) external view returns(
        uint[] children,
        uint[4] timesPerPeriod
    ) {
        Court storage subcourt = courts[_subcourtID];
        children = subcourt.children;
        timesPerPeriod = subcourt.timesPerPeriod;
    }

    /** @dev Gets a specified vote for a specified appeal in a specified dispute.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     *  @param _voteID The ID of the vote.
     *  @return account The account for vote.
     *  @return commit  The commit for vote.
     *  @return choice  The choice for vote.
     *  @return voted True if the account voted, False otherwise.
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
     *  Note: This function is only to be used by the interface and it won't work if the number of choices is too high.
     *  @param _disputeID The ID of the dispute.
     *  @param _appeal The appeal.
     *  @return winningChoice The winning choice.
     *  @return counts The count.
     *  @return tied Whether the vote tied.
     *  `O(n)` where
     *  `n` is the number of choices of the dispute.
     */
    function getVoteCounter(uint _disputeID, uint _appeal) external view returns(
        uint winningChoice,
        uint[] counts,
        bool tied
    ) {
        Dispute storage dispute = disputes[_disputeID];
        VoteCounter storage voteCounter = dispute.voteCounters[_appeal];
        winningChoice = voteCounter.winningChoice;
        counts = new uint[](dispute.numberOfChoices + 1);
        for (uint i = 0; i <= dispute.numberOfChoices; i++) counts[i] = voteCounter.counts[i];
        tied = voteCounter.tied;
    }

    /** @dev Gets a specified dispute's non primitive properties.
     *  @param _disputeID The ID of the dispute.
     *  @return votesLengths The dispute's vote length.
     *  @return tokensAtStakePerJuror The dispute's required tokens at stake per Juror.
     *  @return totalFeesForJurors The dispute's total fees for Jurors.
     *  @return votesInEachRound The dispute's counter of votes made in each round.
     *  @return repartitionsInEachRound The dispute's counter of vote reward repartitions made in each round.
     *  @return penaltiesInEachRound The dispute's amount of tokens collected from penalties in each round.
     *  `O(a)` where
     *  `a` is the number of appeals of the dispute.
     */
    function getDispute(uint _disputeID) external view returns(
        uint[] votesLengths,
        uint[] tokensAtStakePerJuror,
        uint[] totalFeesForJurors,
        uint[] votesInEachRound,
        uint[] repartitionsInEachRound,
        uint[] penaltiesInEachRound
    ) {
        Dispute storage dispute = disputes[_disputeID];
        votesLengths = new uint[](dispute.votes.length);
        for (uint i = 0; i < dispute.votes.length; i++) votesLengths[i] = dispute.votes[i].length;
        tokensAtStakePerJuror = dispute.tokensAtStakePerJuror;
        totalFeesForJurors = dispute.totalFeesForJurors;
        votesInEachRound = dispute.votesInEachRound;
        repartitionsInEachRound = dispute.repartitionsInEachRound;
        penaltiesInEachRound = dispute.penaltiesInEachRound;
    }

    /** @dev Gets a specified juror's non primitive properties.
     *  @param _account The address of the juror.
     *  @return subcourtIDs The juror's IDs of subcourts where the juror has stake path.
     */
    function getJuror(address _account) external view returns(
        uint96[] subcourtIDs
    ) {
        Juror storage juror = jurors[_account];
        subcourtIDs = juror.subcourtIDs;
    }

    /** @dev Gets the stake of a specified juror in a specified subcourt.
     *  @param _account The address of the juror.
     *  @param _subcourtID The ID of the subcourt.
     *  @return stake The stake.
     */
    function stakeOf(address _account, uint96 _subcourtID) external view returns(uint stake) {
        return sortitionSumTrees.stakeOf(bytes32(_subcourtID), accountAndSubcourtIDToStakePathID(_account, _subcourtID));
    }
}
