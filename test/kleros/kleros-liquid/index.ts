import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';
import { soliditySha3 } from 'web3-utils';

import {
  asyncForEach,
  generateSubcourts,
  increaseTime,
} from '../../../utils/test-helpers';
import { useInitialSetup } from '../../../utils/fixtures/kleros-liquid';
import { MiniMeTokenERC20, KlerosLiquid } from '../../../typechain-types';
import { SubcourtInfo } from '../../../utils/interfaces';

const setup = async () => {
  await deployments.fixture('KlerosLiquid', {
    fallbackToGlobal: true,
    keepExistingDeployments: false,
  });

  const pnk = (await ethers.getContract(
    'MiniMeTokenERC20'
  )) as MiniMeTokenERC20;

  const klerosLiquid = (await ethers.getContract(
    'KlerosLiquid'
  )) as KlerosLiquid;

  const args = {
    minStake: 550,
    alpha: 10000,
    feeForJuror: ethers.utils.parseEther('1'),
    jurorsForCourtJump: 511,
    timesPerPeriod: [30, 600, 600, 600],
    sortitionSumTreeK: 4,
  };

  const { subcourtMap } = generateSubcourts(2, 0, args);

  await asyncForEach(
    (subcourt: SubcourtInfo) =>
      klerosLiquid.createSubcourt(
        subcourt.parent,
        subcourt.hiddenVotes,
        subcourt.minStake,
        subcourt.alpha,
        subcourt.feeForJuror,
        subcourt.jurorsForCourtJump,
        subcourt.timesPerPeriod,
        subcourt.sortitionSumTreeK
      ),
    subcourtMap
  );

  const [governor, other, mock] = await ethers.getSigners();

  return { klerosLiquid, pnk, subcourtMap, users: { governor, other, mock } };
};

describe('KlerosLiquid', () => {
  describe('Construction', () => {
    it('Should set state variables correctly', async () => {
      const { klerosLiquid, args } = await useInitialSetup();

      expect(await klerosLiquid.governor()).to.equal(args.governor);
      expect(await klerosLiquid.pinakion()).to.equal(args.pinakion);
      expect(await klerosLiquid.RNGenerator()).to.equal(args.RNG);
      expect(await klerosLiquid.minStakingTime()).to.equal(args.minStakingTime);
      expect(await klerosLiquid.maxDrawingTime()).to.equal(args.maxDrawingTime);

      const parentCourt = await klerosLiquid.courts(0);
      expect(parentCourt.parent).to.equal(0);
      expect(parentCourt.hiddenVotes).to.equal(args.hiddenVotes);
      expect(parentCourt.minStake).to.equal(args.minStake);
      expect(parentCourt.alpha).to.equal(args.alpha);
      expect(parentCourt.feeForJuror).to.equal(args.feeForJuror);
      expect(parentCourt.jurorsForCourtJump).to.equal(args.jurorsForCourtJump);
    });
  });

  describe('Setters', () => {
    it('Should set new governor', async () => {
      const { klerosLiquid, users } = await setup();

      await klerosLiquid.changeGovernor(users.mock.address);
      expect(await klerosLiquid.governor()).to.equal(users.mock.address);
    });

    it('Should set new pinakion', async () => {
      const { klerosLiquid, users } = await setup();

      await klerosLiquid.changePinakion(users.mock.address);
      expect(await klerosLiquid.pinakion()).to.equal(users.mock.address);
    });

    it('Should set new RNGenerator', async () => {
      const { klerosLiquid, users } = await setup();

      await klerosLiquid.changeRNGenerator(users.mock.address);
      expect(await klerosLiquid.RNGenerator()).to.equal(users.mock.address);
    });

    it('Should set new minimum staking time', async () => {
      const { klerosLiquid } = await setup();

      const newMinStakingTime = 30;
      await klerosLiquid.changeMinStakingTime(newMinStakingTime);
      expect(await klerosLiquid.minStakingTime()).to.equal(newMinStakingTime);
    });

    it('Should set new maximum drawing time', async () => {
      const { klerosLiquid } = await setup();

      const newMaxDrawingTime = 400;
      await klerosLiquid.changeMaxDrawingTime(newMaxDrawingTime);
      expect(await klerosLiquid.maxDrawingTime()).to.equal(newMaxDrawingTime);
    });
  });

  describe('Court Tree', () => {
    describe('Construction', () => {
      it('Should create subcourts under specified parent court', async () => {
        const { klerosLiquid, subcourtMap } = await setup();

        await asyncForEach(async (subcourt: SubcourtInfo) => {
          const court = await klerosLiquid.courts(subcourt.ID);
          expect([...court]).to.deep.equal([
            subcourt.parent,
            subcourt.hiddenVotes,
            subcourt.minStake,
            subcourt.alpha,
            subcourt.feeForJuror,
            subcourt.jurorsForCourtJump,
          ]);
        }, subcourtMap);
      });
    });
    describe('Subcourt Setters', () => {
      it('Should set new minimum stake', async () => {
        const { klerosLiquid, users } = await setup();

        const court = await klerosLiquid.getSubcourt(0);

        const newMinStake = 700;
        await klerosLiquid
          .connect(users.governor)
          .changeSubcourtMinStake(court.children[0], newMinStake);

        const subcourt = await klerosLiquid.courts(court.children[0]);
        expect(subcourt.minStake).to.equal(newMinStake);
      });

      it('Should set new alpha', async () => {
        const { klerosLiquid, users } = await setup();

        const court = await klerosLiquid.getSubcourt(0);

        const newAlpha = 100;
        await klerosLiquid
          .connect(users.governor)
          .changeSubcourtAlpha(court.children[0], newAlpha);

        const subcourt = await klerosLiquid.courts(court.children[0]);
        expect(subcourt.alpha).to.equal(newAlpha);
      });

      it('Should set new juror fee', async () => {
        const { klerosLiquid, users } = await setup();

        const court = await klerosLiquid.getSubcourt(0);

        const newJurorFee = ethers.utils.parseEther('1');
        await klerosLiquid
          .connect(users.governor)
          .changeSubcourtJurorFee(court.children[0], newJurorFee);

        const subcourt = await klerosLiquid.courts(court.children[0]);
        expect(subcourt.feeForJuror).to.equal(newJurorFee);
      });

      it('Should set new number of jurors for court jump', async () => {
        const { klerosLiquid, users } = await setup();

        const court = await klerosLiquid.getSubcourt(0);

        const newJurorsForCourtJump = 400;
        await klerosLiquid
          .connect(users.governor)
          .changeSubcourtJurorsForJump(
            court.children[0],
            newJurorsForCourtJump
          );

        const subcourt = await klerosLiquid.courts(court.children[0]);
        expect(subcourt.jurorsForCourtJump).to.equal(newJurorsForCourtJump);
      });

      it('Should set new times per period', async () => {
        const { klerosLiquid, users } = await setup();

        const court = await klerosLiquid.getSubcourt(0);

        const newTimesPerPeriod = [100, 1000, 1000, 1000]; // TODO: cant figure out how to cast the Type
        await klerosLiquid
          .connect(users.governor)
          .changeSubcourtTimesPerPeriod(court.children[0], [
            100,
            1000,
            1000,
            1000,
          ]);

        const subcourt = await klerosLiquid.getSubcourt(court.children[0]);
        expect(subcourt.timesPerPeriod).to.deep.equal(newTimesPerPeriod);
      });
    });
  });
});
