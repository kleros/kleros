import { ethers } from 'hardhat';
import { expect } from 'chai';

import { increaseTime } from 'utils/test-helpers';
import { useDisputeSetup } from 'utils/fixtures/kleros-liquid';
import { KlerosLiquidExtraViews } from 'typechain-types';

const setup = async (numberOfJurors?: number, treeDepth?: number) => {
  const {
    klerosLiquid,
    pnk,
    subcourt,
    subcourtTree,
    users,
  } = await useDisputeSetup(numberOfJurors, treeDepth);

  const extraViews = (await ethers.getContract(
    'KlerosLiquidExtraViews'
  )) as KlerosLiquidExtraViews;

  const minStakingTime = await klerosLiquid.minStakingTime();
  await increaseTime(minStakingTime.toNumber());
  await klerosLiquid.passPhase();

  return { klerosLiquid, extraViews, pnk, subcourtTree, subcourt, users };
};

describe('KlerosLiquidExtraViews', () => {
  describe('Staking & Jurors', () => {
    it('Should query delayed stakes correctly', async () => {
      const numberOfJurors = 3;
      const { klerosLiquid, extraViews, pnk, subcourt, users } = await setup(
        numberOfJurors
      );

      const totalStake = 3 * subcourt.minStake;
      await pnk.generateTokens(users.governor.address, totalStake);
      await klerosLiquid.setStake(0, subcourt.minStake);
      await klerosLiquid.setStake(1, 2 * subcourt.minStake);

      const stake0 = await extraViews.stakeOf(users.governor.address, 0);
      expect(stake0).to.be.equal(subcourt.minStake);

      const stake1 = await extraViews.stakeOf(users.governor.address, 1);
      expect(stake1).to.be.equal(2 * subcourt.minStake);

      const juror = await extraViews.getJuror(users.governor.address);
      expect(juror.stakedTokens).to.be.equal(totalStake);
      expect(juror.lockedTokens).to.be.equal(0);
      expect(juror.subcourtIDs).to.deep.equal([1, 2, 0, 0]);
      expect(juror.subcourtStakes).to.deep.equal([stake0, stake1, 0, 0]);
    });

    it('Should ignore delayed stakes below the minStake in a court', async () => {
      const numberOfJurors = 3;
      const { klerosLiquid, extraViews, pnk, subcourt, users } = await setup(
        numberOfJurors
      );

      await pnk.generateTokens(users.governor.address, subcourt.minStake);
      await klerosLiquid.setStake(0, subcourt.minStake - 1);

      const stake0 = await extraViews.stakeOf(
        users.governor.address,
        subcourt.ID
      );
      expect(stake0).to.be.equal(0);
    });

    it('Should ignore delayed stake in a fifth subcourt path', async () => {
      const numberOfJurors = 3;
      const treeDepth = 3;
      const {
        klerosLiquid,
        extraViews,
        pnk,
        subcourtTree,
        users,
      } = await setup(numberOfJurors, treeDepth);

      const totalStake = 5 * subcourtTree.minStake;
      await pnk.generateTokens(users.governor.address, totalStake);

      // Set delayed stakes in 4 paths.
      await klerosLiquid.setStake(subcourtTree.ID, subcourtTree.minStake);
      await klerosLiquid.setStake(
        subcourtTree.children[0].ID,
        subcourtTree.children[0].minStake
      );
      await klerosLiquid.setStake(
        subcourtTree.children[1].ID,
        subcourtTree.children[1].minStake
      );
      await klerosLiquid.setStake(
        subcourtTree.children[0].children[0].ID,
        subcourtTree.children[0].children[0].minStake
      );
      await klerosLiquid.setStake(
        subcourtTree.children[0].children[1].ID,
        subcourtTree.children[0].children[1].minStake - 1
      );

      const juror = await extraViews.getJuror(users.governor.address);
      expect(juror.stakedTokens).not.to.be.equal(totalStake);
      expect(juror.lockedTokens).to.be.equal(0);
      expect(juror.subcourtIDs).to.deep.equal([
        subcourtTree.ID + 1,
        subcourtTree.children[0].ID + 1,
        subcourtTree.children[1].ID + 1,
        subcourtTree.children[0].children[0].ID + 1,
      ]);
      expect(juror.subcourtStakes).to.deep.equal([
        subcourtTree.minStake,
        subcourtTree.children[0].minStake,
        subcourtTree.children[1].minStake,
        subcourtTree.children[0].children[0].minStake,
      ]);
    });

    it('Should validate unstaking', async () => {
      const numberOfJurors = 3;
      const treeDepth = 3;
      const {
        klerosLiquid,
        extraViews,
        pnk,
        subcourtTree,
        users,
      } = await setup(numberOfJurors, treeDepth);

      let totalStake = 4 * subcourtTree.minStake;
      await pnk.generateTokens(users.governor.address, totalStake);

      await klerosLiquid.setStake(subcourtTree.ID, subcourtTree.minStake);
      await klerosLiquid.setStake(
        subcourtTree.children[0].ID,
        subcourtTree.children[0].minStake
      );
      await klerosLiquid.setStake(
        subcourtTree.children[1].ID,
        subcourtTree.children[1].minStake
      );
      await klerosLiquid.setStake(
        subcourtTree.children[0].children[0].ID,
        subcourtTree.children[0].children[0].minStake
      );

      // Unstake
      await klerosLiquid.setStake(subcourtTree.children[0].ID, 0);
      totalStake -= subcourtTree.children[0].minStake;

      const juror = await extraViews.getJuror(users.governor.address);
      expect(juror.stakedTokens).to.be.equal(totalStake);
      expect(juror.lockedTokens).to.be.equal(0);
      expect(juror.subcourtIDs).to.deep.equal([
        subcourtTree.ID + 1,
        0,
        subcourtTree.children[1].ID + 1,
        subcourtTree.children[0].children[0].ID + 1,
      ]);
      expect(juror.subcourtStakes).to.deep.equal([
        subcourtTree.minStake,
        0,
        subcourtTree.children[1].minStake,
        subcourtTree.children[0].children[0].minStake,
      ]);
    });
  });
});
