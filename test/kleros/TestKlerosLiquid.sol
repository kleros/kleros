pragma solidity ^0.4.24;

import "truffle/Assert.sol";
import { MiniMeTokenERC20 as Pinakion } from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";
import "kleros-interaction/contracts/standard/rng/ConstantNG.sol";

import "../../contracts/kleros/KlerosLiquid.sol";

contract TestKlerosLiquid {
    /* Testing */

    Pinakion pinakion;
    ConstantNG constantNG;
    KlerosLiquid klerosLiquid;
    function beforeEach() public {
        pinakion = new Pinakion(
            address(0),
            address(0),
            0,
            "Pinakion",
            18,
            "PNK",
            true
        );
        constantNG = new ConstantNG(10);
        klerosLiquid = new KlerosLiquid(
            this,
            pinakion,
            constantNG,
            1,
            1,
            true,
            100,
            1000,
            100,
            3,
            15,
            [uint(1), uint(1), uint(1), uint(1)],
            3
        );
    }

    // /* Modifiers */

    // /** @dev Requires a specific phase.
    //  *  @param _phase The required phase.
    //  */
    // modifier onlyDuringPhase(Phase _phase) {require(phase == _phase, "Incorrect phase."); _;}

    // /** @dev Requires a specific period in a dispute.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _period The required period.
    //  */
    // modifier onlyDuringPeriod(uint _disputeID, Period _period) {require(disputes[_disputeID].period == _period, "Incorrect period."); _;}

    // /** @dev Requires that the sender is the governor. */
    // modifier onlyByGovernor() {require(governor == msg.sender, "Can only be called by the governor."); _;}

    // /* Constructor */

    // /** @dev Constructs the KlerosLiquid contract.
    //  *  @param _governor The governor's address.
    //  *  @param _pinakion The address of the token contract.
    //  *  @param _RNGenerator The address of the RNG contract.
    //  *  @param _minStakingTime The minimum time that the staking phase should last.
    //  *  @param _maxDrawingTime The maximum time that the drawing phase should last.
    //  *  @param _hiddenVotes The `hiddenVotes` property value of the general court.
    //  *  @param _minStake The `minStake` property value of the general court.
    //  *  @param _alpha The `alpha` property value of the general court.
    //  *  @param _jurorFee The `jurorFee` property value of the general court.
    //  *  @param _minJurors The `minJurors` property value of the general court.
    //  *  @param _jurorsForJump The `jurorsForJump` property value of the general court.
    //  *  @param _timesPerPeriod The `timesPerPeriod` property value of the general court.
    //  *  @param _sortitionSumTreeK The number of children per node of the general court's sortition sum tree.
    //  */
    // constructor(
    //     address _governor,
    //     Pinakion _pinakion,
    //     RNG _RNGenerator,
    //     uint _minStakingTime,
    //     uint _maxDrawingTime,
    //     bool _hiddenVotes,
    //     uint _minStake,
    //     uint _alpha,
    //     uint _jurorFee,
    //     uint _minJurors,
    //     uint _jurorsForJump,
    //     uint[4] _timesPerPeriod,
    //     uint _sortitionSumTreeK
    // ) public {
    //     // Initialize contract.
    //     governor = _governor;
    //     pinakion = _pinakion;
    //     RNGenerator = _RNGenerator;
    //     minStakingTime = _minStakingTime;
    //     maxDrawingTime = _maxDrawingTime;
    //     lastPhaseChange = block.timestamp; // solium-disable-line security/no-block-members

    //     // Create the general court.
    //     courts.push(Court({
    //         parent: 0,
    //         children: new uint[](0),
    //         vacantChildrenIndexes: new uint[](0),
    //         hiddenVotes: _hiddenVotes,
    //         minStake: _minStake,
    //         alpha: _alpha,
    //         jurorFee: _jurorFee,
    //         minJurors: _minJurors,
    //         jurorsForJump: _jurorsForJump,
    //         timesPerPeriod: _timesPerPeriod
    //     }));
    //     createTree(bytes32(0), _sortitionSumTreeK);
    // }

    // /* External */

    // /** @dev Changes the `governor` storage variable.
    //  *  @param _governor The new value for the `governor` storage variable.
    //  */
    // function changeGovernor(address _governor) external onlyByGovernor {
    //     governor = _governor;
    // }

    // /** @dev Changes the `pinakion` storage variable.
    //  *  @param _pinakion The new value for the `pinakion` storage variable.
    //  */
    // function changePinakion(Pinakion _pinakion) external onlyByGovernor {
    //     pinakion = _pinakion;
    // }

    // /** @dev Changes the `RNGenerator` storage variable.
    //  *  @param _RNGenerator The new value for the `RNGenerator` storage variable.
    //  */
    // function changeRNGenerator(RNG _RNGenerator) external onlyByGovernor {
    //     RNGenerator = _RNGenerator;
    // }

    // /** @dev Changes the `minStakingTime` storage variable.
    //  *  @param _minStakingTime The new value for the `minStakingTime` storage variable.
    //  */
    // function changeMinStakingTime(uint _minStakingTime) external onlyByGovernor {
    //     minStakingTime = _minStakingTime;
    // }

    // /** @dev Changes the `maxDrawingTime` storage variable.
    //  *  @param _maxDrawingTime The new value for the `maxDrawingTime` storage variable.
    //  */
    // function changeMaxDrawingTime(uint _maxDrawingTime) external onlyByGovernor {
    //     maxDrawingTime = _maxDrawingTime;
    // }

    // /** @dev Creates a subcourt under a specified parent court.
    //  *  @param _parent The `parent` property value of the subcourt.
    //  *  @param _hiddenVotes The `hiddenVotes` property value of the subcourt.
    //  *  @param _minStake The `minStake` property value of the subcourt.
    //  *  @param _alpha The `alpha` property value of the subcourt.
    //  *  @param _jurorFee The `jurorFee` property value of the subcourt.
    //  *  @param _minJurors The `minJurors` property value of the subcourt.
    //  *  @param _jurorsForJump The `jurorsForJump` property value of the subcourt.
    //  *  @param _timesPerPeriod The `timesPerPeriod` property value of the subcourt.
    //  *  @param _sortitionSumTreeK The number of children per node of the subcourt's sortition sum tree.
    //  */
    // function createSubcourt(
    //     uint _parent,
    //     bool _hiddenVotes,
    //     uint _minStake,
    //     uint _alpha,
    //     uint _jurorFee,
    //     uint _minJurors,
    //     uint _jurorsForJump,
    //     uint[4] _timesPerPeriod,
    //     uint _sortitionSumTreeK
    // ) external onlyByGovernor {
    //     require(courts[_parent].minStake <= _minStake, "A subcourt cannot be a child of a subcourt with a higher minimum stake.");

    //     // Create the subcourt.
    //     uint _subcourtID = courts.push(Court({
    //         parent: _parent,
    //         children: new uint[](0),
    //         vacantChildrenIndexes: new uint[](0),
    //         hiddenVotes: _hiddenVotes,
    //         minStake: _minStake,
    //         alpha: _alpha,
    //         jurorFee: _jurorFee,
    //         minJurors: _minJurors,
    //         jurorsForJump: _jurorsForJump,
    //         timesPerPeriod: _timesPerPeriod
    //     })) - 1;
    //     createTree(bytes32(_subcourtID), _sortitionSumTreeK);

    //     // Update the parent.
    //     if (courts[_parent].vacantChildrenIndexes.length > 0) {
    //         uint _vacantIndex = courts[_parent].vacantChildrenIndexes[courts[_parent].vacantChildrenIndexes.length - 1];
    //         courts[_parent].vacantChildrenIndexes.length--;
    //         courts[_parent].children[_vacantIndex] = _subcourtID;
    //     } else courts[_parent].children.push(_subcourtID);
    // }

    // /** @dev Move a subcourt to a new parent.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _parent The new `parent` property value of the subcourt.
    //  */
    // function moveSubcourt(uint _subcourtID, uint _parent) external onlyByGovernor {
    //     require(_subcourtID != 0, "Cannot move the general court.");
    //     require(
    //         courts[_parent].minStake <= courts[_subcourtID].minStake,
    //         "A subcourt cannot be a child of a subcourt with a higher minimum stake."
    //     );

    //     // Update the old parent's children, if any.
    //     for (uint i = 0; i < courts[courts[_subcourtID].parent].children.length; i++)
    //         if (courts[courts[_subcourtID].parent].children[i] == _subcourtID) {
    //             delete courts[courts[_subcourtID].parent].children[i];
    //             courts[courts[_subcourtID].parent].vacantChildrenIndexes.push(i);
    //             break;
    //         }
        
    //     // Set the new parent.
    //     courts[_subcourtID].parent = _parent;
    // }

    // /** @dev Changes the `hiddenVotes` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _hiddenVotes The new value for the `hiddenVotes` property value.
    //  */
    // function changeSubcourtHiddenVotes(uint _subcourtID, bool _hiddenVotes) external onlyByGovernor {
    //     courts[_subcourtID].hiddenVotes = _hiddenVotes;
    // }

    // /** @dev Changes the `minStake` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _minStake The new value for the `minStake` property value.
    //  */
    // function changeSubcourtMinStake(uint _subcourtID, uint _minStake) external onlyByGovernor {
    //     courts[_subcourtID].minStake = _minStake;
    // }

    // /** @dev Changes the `alpha` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _alpha The new value for the `alpha` property value.
    //  */
    // function changeSubcourtAlpha(uint _subcourtID, uint _alpha) external onlyByGovernor {
    //     courts[_subcourtID].alpha = _alpha;
    // }

    // /** @dev Changes the `jurorFee` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _jurorFee The new value for the `jurorFee` property value.
    //  */
    // function changeSubcourtJurorFee(uint _subcourtID, uint _jurorFee) external onlyByGovernor {
    //     courts[_subcourtID].jurorFee = _jurorFee;
    // }

    // /** @dev Changes the `minJurors` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _minJurors The new value for the `minJurors` property value.
    //  */
    // function changeSubcourtMinJurors(uint _subcourtID, uint _minJurors) external onlyByGovernor {
    //     courts[_subcourtID].minJurors = _minJurors;
    // }

    // /** @dev Changes the `jurorsForJump` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _jurorsForJump The new value for the `jurorsForJump` property value.
    //  */
    // function changeSubcourtJurorsForJump(uint _subcourtID, uint _jurorsForJump) external onlyByGovernor {
    //     courts[_subcourtID].jurorsForJump = _jurorsForJump;
    // }

    // /** @dev Changes the `timesPerPeriod` property value of the specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _timesPerPeriod The new value for the `timesPerPeriod` property value.
    //  */
    // function changeSubcourtTimesPerPeriod(uint _subcourtID, uint[4] _timesPerPeriod) external onlyByGovernor {
    //     courts[_subcourtID].timesPerPeriod = _timesPerPeriod;
    // }

    // /** @dev Pass the phase. */
    // function passPhase() external {
    //     if (phase == Phase.staking) {
    //         // solium-disable-next-line security/no-block-members
    //         require(block.timestamp - lastPhaseChange >= minStakingTime, "The minimum staking time has not passed yet.");
    //         require(disputesWithoutJurors > 0, "There are no disputes that need jurors.");
    //         RNBlock = block.number + 1;
    //         RNGenerator.requestRN(RNBlock);
    //         phase = Phase.generating;
    //     } else if (phase == Phase.generating) {
    //         RN = RNGenerator.getUncorrelatedRN(RNBlock);
    //         require(RN != 0, "Random number is not ready yet.");
    //         phase = Phase.drawing;
    //     } else if (phase == Phase.drawing) {
    //         // solium-disable-next-line security/no-block-members
    //         require(disputesWithoutJurors == 0 || block.timestamp - lastPhaseChange >= maxDrawingTime, "There are still disputes without jurors and the maximum drawing time has not passed yet.");
    //         phase = Phase.staking;
    //     }

    //     // solium-disable-next-line security/no-block-members
    //     lastPhaseChange = block.timestamp;
    //     emit NewPhase(phase);
    // }

    // /** @dev Pass the period of a specified dispute.
    //  *  @param _disputeID The ID of the dispute.
    //  */
    // function passPeriod(uint _disputeID) external {
    //     Dispute storage dispute = disputes[_disputeID];
    //     if (dispute.period == Period.evidence) {
    //         // solium-disable-next-line security/no-block-members
    //         require(block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)], "The evidence period time has not passed yet.");
    //         require(dispute.appealDraws[dispute.appealDraws.length - 1] == dispute.votes[dispute.votes.length - 1].length, "The dispute has not finished drawing yet.");
    //         dispute.period = courts[dispute.subcourtID].hiddenVotes ? Period.commit : Period.vote;
    //     } else if (dispute.period == Period.commit) {
    //         require(
    //             // solium-disable-next-line security/no-block-members
    //             block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.appealCommits[dispute.appealCommits.length - 1] == dispute.votes[dispute.votes.length - 1].length,
    //             "The commit period time has not passed yet and not every juror has committed yet."
    //         );
    //         dispute.period = Period.vote;
    //     } else if (dispute.period == Period.vote) {
    //         require(
    //             // solium-disable-next-line security/no-block-members
    //             block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)] || dispute.appealVotes[dispute.appealVotes.length - 1] == dispute.votes[dispute.votes.length - 1].length,
    //             "The vote period time has not passed yet and not every juror has voted yet."
    //         );
    //         dispute.period = Period.appeal;
    //     } else if (dispute.period == Period.appeal) {
    //         // solium-disable-next-line security/no-block-members
    //         require(block.timestamp - dispute.lastPeriodChange >= courts[dispute.subcourtID].timesPerPeriod[uint(dispute.period)], "The appeal period time has not passed yet.");
    //         dispute.period = Period.execution;
    //     } else if (dispute.period == Period.execution) {
    //         revert("The dispute is already in the last period.");
    //     }

    //     // solium-disable-next-line security/no-block-members
    //     dispute.lastPeriodChange = block.timestamp;
    //     emit NewPeriod(_disputeID, dispute.period);
    // }

    // /** @dev Sets the caller's stake in a subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _stake The new stake.
    //  */
    // function setStake(uint _subcourtID, uint _stake) external onlyDuringPhase(Phase.staking) {
    //     require(
    //         _stake == 0 || courts[_subcourtID].minStake <= _stake,
    //         "The juror's stake cannot be lower than the minimum stake for the subcourt."
    //     );
    //     uint _stakeDiff = _stake - stakeOf(bytes32(_subcourtID), msg.sender);
    //     require(
    //         _stake == 0 || pinakion.balanceOf(msg.sender) >= stakeOf(bytes32(0), msg.sender) + _stakeDiff,
    //         "The juror's total amount of staked tokens cannot be higher than the juror's balance."
    //     );

    //     Juror storage juror = jurors[msg.sender];
    //     if (_stake == 0) {
    //         if (juror.currentSubcourtIDsMap[_subcourtID]) juror.currentSubcourtIDsMap[_subcourtID] = false;
    //     }
    //     else if (!juror.subcourtIDsMap[_subcourtID]) {
    //         juror.subcourtIDs.push(_subcourtID);
    //         juror.currentSubcourtIDsMap[_subcourtID] = true;
    //         juror.subcourtIDsMap[_subcourtID] = true;
    //     } else if (!juror.currentSubcourtIDsMap[_subcourtID]) juror.currentSubcourtIDsMap[_subcourtID] = true;

    //     bool _finished = false;
    //     uint _currentSubcourtID = _subcourtID;
    //     while (!_finished) {
    //         uint _currentSubcourtStake = stakeOf(bytes32(_currentSubcourtID), msg.sender);
    //         if (_currentSubcourtStake == 0) append(bytes32(_currentSubcourtID), _stake, msg.sender);
    //         else set(
    //             bytes32(_currentSubcourtID),
    //             sortitionSumTrees[bytes32(_currentSubcourtID)].addressesToTreeIndexes[msg.sender],
    //             _currentSubcourtStake + _stakeDiff,
    //             msg.sender
    //         );
    //         if (_currentSubcourtID == 0)  _finished = true;
    //         else _currentSubcourtID = courts[_currentSubcourtID].parent;
    //     }
    // }

    // /** @dev Draws jurors for a dispute. Can be called in parts.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _iterations The number of iterations to run.
    //  */
    // function draw(uint _disputeID, uint _iterations) external onlyDuringPhase(Phase.drawing) onlyDuringPeriod(_disputeID, Period.evidence) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     uint _startIndex = dispute.appealDraws[dispute.appealDraws.length - 1];
    //     uint _endIndex = _iterations == 0 ? dispute.votes[dispute.votes.length - 1].length : _startIndex + _iterations;
    //     for (uint i = _startIndex; i < _endIndex; i++) {
    //         address _drawnAddress = super.draw(bytes32(dispute.subcourtID), uint(keccak256(RN, _disputeID, i)));
    //         dispute.votes[dispute.votes.length - 1][i]._address = _drawnAddress;
    //         dispute.appealDraws[dispute.appealDraws.length - 1]++;
    //         jurors[msg.sender].atStake += dispute.jurorAtStake[dispute.jurorAtStake.length - 1];
    //         emit Draw(_disputeID, dispute.arbitrated, _drawnAddress, i);
    //     }
    // }

    // /** @dev Sets the caller's commit for a specified vote.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _voteID The ID of the vote.
    //  *  @param _commit The commit.
    //  */
    // function commit(uint _disputeID, uint _voteID, bytes32 _commit) external onlyDuringPeriod(_disputeID, Period.commit) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     require(dispute.votes[dispute.votes.length - 1][_voteID]._address == msg.sender, "The caller has to own the vote.");
    //     dispute.votes[dispute.votes.length - 1][_voteID].commit = _commit;
    //     dispute.appealCommits[dispute.appealCommits.length - 1]++;
    // }

    // /** @dev Sets the caller's choice for a specified vote.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _voteID The ID of the vote.
    //  *  @param _choice The choice.
    //  *  @param _salt The salt for the commit if the vote was hidden.
    //  */
    // function vote(uint _disputeID, uint _voteID, uint _choice, uint _salt) external onlyDuringPeriod(_disputeID, Period.vote) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     require(dispute.votes[dispute.votes.length - 1][_voteID]._address == msg.sender, "The caller has to own the vote.");
    //     require(dispute.numberOfChoices >= _choice, "The choice has to be less than or equal to the number of choices for the dispute.");
    //     require(
    //         !courts[dispute.subcourtID].hiddenVotes || dispute.votes[dispute.votes.length - 1][_voteID].commit == keccak256(_disputeID, _voteID, _choice, _salt),
    //         "The commit must match the choice in subcourts with hidden votes."
    //     );
    //     dispute.votes[dispute.votes.length - 1][_voteID].choice = _choice;
    //     dispute.appealVotes[dispute.appealVotes.length - 1]++;
    //     VoteCounter storage voteCounter = dispute.voteCounters[dispute.voteCounters.length - 1];
    //     voteCounter.counts[_choice]++;
    //     if (voteCounter.counts[_choice] > voteCounter.counts[voteCounter.winningChoice]) voteCounter.winningChoice = _choice;
    // }

    // /** @dev Executes a specified dispute's ruling and repartitions tokens and ETH for a specified appeal. Can be called in parts.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _appeal The appeal.
    //  *  @param _iterations The number of iterations to run.
    //  */
    // function execute(uint _disputeID, uint _appeal, uint _iterations) external onlyDuringPeriod(_disputeID, Period.execution) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     executionCache.winningChoice = dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
    //     executionCache.startIndex = dispute.appealRepartitions[_appeal];
    //     executionCache.endIndex = _iterations == 0 ? dispute.votes[_appeal].length : executionCache.startIndex + _iterations;

    //     executionCache.coherentCount = dispute.voteCounters[_appeal].counts[executionCache.winningChoice];
    //     if (executionCache.coherentCount != 0) {
    //         if (_appeal == 0 && executionCache.startIndex == 0 && isContract(dispute.arbitrated)) dispute.arbitrated.rule(_disputeID, executionCache.winningChoice);
    //         executionCache.incoherentCount = dispute.votes[_appeal].length - executionCache.coherentCount;
    //         executionCache.tokenReward = (dispute.jurorAtStake[_appeal] * executionCache.incoherentCount) / executionCache.coherentCount;
    //         executionCache.ETHReward = dispute.totalJurorFees[_appeal] / executionCache.coherentCount;
    //     }

    //     for (uint i = executionCache.startIndex; i < executionCache.endIndex; i++) {
    //         Vote storage vote = dispute.votes[_appeal][i];
    //         if (vote.choice == executionCache.winningChoice) {
    //             pinakion.transfer(vote._address, executionCache.tokenReward);
    //             vote._address.transfer(executionCache.ETHReward);
    //             emit TokenAndETHShift(_disputeID, vote._address, int(executionCache.tokenReward), int(executionCache.ETHReward));
    //         } else {
    //             pinakion.transferFrom(vote._address, this, dispute.jurorAtStake[_appeal]);
    //             emit TokenAndETHShift(_disputeID, vote._address, -int(dispute.jurorAtStake[_appeal]), 0);
    //         }
    //         jurors[vote._address].atStake -= dispute.jurorAtStake[_appeal];
    //         dispute.appealRepartitions[_appeal]++;
    //     }
    // }

    // /* External Views */

    

    // /* Public */

    // /** @dev Creates a dispute. Must be called by the arbitrable contract.
    //  *  @param _subcourtID The ID of the subcourt to create the dispute in.
    //  *  @param _numberOfChoices Number of choices to choose from in the dispute to be created.
    //  *  @param _extraData Additional info about the dispute to be created.
    //  *  @return The ID of the created dispute.
    //  */
    // function createDispute(
    //     uint _subcourtID,
    //     uint _numberOfChoices,
    //     bytes _extraData
    // ) public payable returns(uint disputeID)  {
    //     require(
    //         msg.value >= arbitrationCost(_subcourtID, _extraData),
    //         "There is not enough ETH to pay the minimum number of jurors for disputes in this subcourt."
    //     );
    //     require(_numberOfChoices == 2, "We only support binary disputes for now.");
    //     disputeID = disputes.length++;
    //     Dispute storage dispute = disputes[disputeID];
    //     dispute.subcourtID = _subcourtID;
    //     dispute.arbitrated = Arbitrable(msg.sender);
    //     dispute.numberOfChoices = _numberOfChoices;
    //     dispute.period = Period.evidence;
    //     // solium-disable-next-line security/no-block-members
    //     dispute.lastPeriodChange = block.timestamp;
    //     dispute.votes[dispute.votes.length++].length = msg.value / courts[dispute.subcourtID].jurorFee;
    //     dispute.voteCounters.push(VoteCounter({ winningChoice: 1, counts: new uint[](dispute.numberOfChoices + 1) }));
    //     dispute.jurorAtStake.push((courts[dispute.subcourtID].minStake * courts[dispute.subcourtID].alpha) / ALPHA_DIVISOR);
    //     dispute.totalJurorFees.push(msg.value);
    //     dispute.appealDraws.push(0);
    //     dispute.appealCommits.push(0);
    //     dispute.appealVotes.push(0);
    //     dispute.appealRepartitions.push(0);
    //     disputesWithoutJurors++;

    //     emit DisputeCreation(disputeID, Arbitrable(msg.sender));
    // }

    // /** @dev Appeal the ruling of a specified dispute.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _extraData Additional info about the appeal.
    //  */
    // function appeal(
    //     uint _disputeID,
    //     bytes _extraData
    // ) public payable requireAppealFee(_disputeID, _extraData) onlyDuringPeriod(_disputeID, Period.appeal) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     if (dispute.votes[dispute.votes.length - 1].length >= courts[dispute.subcourtID].jurorsForJump) // Jump to parent subcourt.
    //         dispute.subcourtID = courts[dispute.subcourtID].parent;
    //     dispute.period = Period.evidence;
    //     dispute.votes[dispute.votes.length++].length = msg.value / courts[dispute.subcourtID].jurorFee;
    //     dispute.voteCounters.push(VoteCounter({ winningChoice: 1, counts: new uint[](dispute.numberOfChoices + 1) }));
    //     dispute.jurorAtStake.push((courts[dispute.subcourtID].minStake * courts[dispute.subcourtID].alpha) / ALPHA_DIVISOR);
    //     dispute.totalJurorFees.push(msg.value);
    //     dispute.appealDraws.push(0);
    //     dispute.appealCommits.push(0);
    //     dispute.appealVotes.push(0);
    //     dispute.appealRepartitions.push(0);
    //     disputesWithoutJurors++;

    //     emit AppealDecision(_disputeID, Arbitrable(msg.sender));
    // }

    // /** @dev Called when `_owner` sends ether to the MiniMe Token contract.
    //  *  @param _owner The address that sent the ether to create tokens.
    //  *  @return Wether the operation should be allowed or not.
    //  */
    // function proxyPayment(address _owner) public payable returns(bool allowed) { allowed = true; }

    // /** @dev Notifies the controller about a token transfer allowing the controller to react if desired.
    //  *  @param _from The origin of the transfer.
    //  *  @param _to The destination of the transfer.
    //  *  @param _amount The amount of the transfer.
    //  *  @return Wether the operation should be allowed or not.
    //  */
    // function onTransfer(address _from, address _to, uint _amount) public returns(bool allowed) {
    //     uint _newBalance = pinakion.balanceOf(_from) - _amount;
    //     require(_newBalance >= stakeOf(bytes32(0), msg.sender), "Cannot transfer an amount that would make balance less than stake.");
    //     require(_newBalance >= jurors[_from].atStake, "Cannot transfer an amount that would make balance less than locked stake.");
    //     allowed = true;
    // }

    // /** @dev Notifies the controller about an approval allowing the controller to react if desired.
    //  *  @param _owner The address that calls `approve()`.
    //  *  @param _spender The spender in the `approve()` call.
    //  *  @param _amount The amount in the `approve()` call.
    //  *  @return Wether the operation should be allowed or not.
    //  */
    // function onApprove(address _owner, address _spender, uint _amount) public returns(bool allowed) { allowed = true; }

    // /* Public Views */

    // /** @dev Implement original `arbitrationCost()` from standard for compilation.
    //  *  @param _extraData Additional info about the dispute.
    //  *  @return The cost.
    //  */
    // function arbitrationCost(bytes _extraData) public view returns(uint cost) {
    //     cost = NON_PAYABLE_AMOUNT;
    // }

    // /** @dev Get the cost of arbitration in a specified subcourt.
    //  *  @param _subcourtID The ID of the subcourt.
    //  *  @param _extraData Additional info about the dispute.
    //  *  @return The cost.
    //  */
    // function arbitrationCost(uint _subcourtID, bytes _extraData) public view returns(uint cost) {
    //     cost = courts[_subcourtID].jurorFee * courts[_subcourtID].minJurors;
    // }

    // /** @dev Get the cost of appealing a specified dispute.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @param _extraData Additional info about the appeal.
    //  *  @return The cost.
    //  */
    // function appealCost(uint _disputeID, bytes _extraData) public view returns(uint cost) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     uint _lastNumberOfJurors = dispute.votes[dispute.votes.length - 1].length;
    //     if (_lastNumberOfJurors >= courts[dispute.subcourtID].jurorsForJump) // Jump to parent subcourt.
    //         if (dispute.subcourtID == 0) // Already in the general court.
    //             cost = NON_PAYABLE_AMOUNT;
    //         else
    //             cost = courts[courts[dispute.subcourtID].parent].jurorFee * courts[courts[dispute.subcourtID].parent].minJurors;
    //     else // Stay in current subcourt.
    //         cost = courts[dispute.subcourtID].jurorFee * ((_lastNumberOfJurors * 2) + 1);
    // }

    // /** @dev Get the status of a specified dispute.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @return The status.
    //  */
    // function disputeStatus(uint _disputeID) public view returns(DisputeStatus status) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     if (dispute.period < Period.appeal) status = DisputeStatus.Waiting;
    //     else if (dispute.period < Period.execution) status = DisputeStatus.Appealable;
    //     else status = DisputeStatus.Solved;
    // }

    // /** @dev Get the current ruling of a specified dispute.
    //  *  @param _disputeID The ID of the dispute.
    //  *  @return The current ruling.
    //  */
    // function currentRuling(uint _disputeID) public view returns(uint ruling) {
    //     Dispute storage dispute = disputes[_disputeID];
    //     ruling = dispute.voteCounters[dispute.voteCounters.length - 1].winningChoice;
    // }

    // /* Internal */



    // /* Internal Views */

    // /** @dev Check if the specified address is a contract address.
    //  *  @param _address The address to check.
    //  *  @return Wether the address is a contract address or not.
    //  */
    // function isContract(address _address) internal view returns(bool isContract) {
    //     uint32 size;
    //     // solium-disable-next-line security/no-inline-assembly
    //     assembly {
    //         size := extcodesize(_address)
    //     }
    //     isContract = size > 0;
    // }

    // /* Private */



    // /* Private Views */



}
