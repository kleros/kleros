import { expect } from 'chai';

import { useInitialSetup } from 'utils/fixtures/kleros-liquid';

describe('KlerosLiquid Smoke', () => {
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
      const { klerosLiquid, users } = await useInitialSetup();

      await klerosLiquid.changeGovernor(users.mock.address);
      expect(await klerosLiquid.governor()).to.equal(users.mock.address);
    });

    it('Should set new pinakion', async () => {
      const { klerosLiquid, users } = await useInitialSetup();

      await klerosLiquid.changePinakion(users.mock.address);
      expect(await klerosLiquid.pinakion()).to.equal(users.mock.address);
    });

    it('Should set new RNGenerator', async () => {
      const { klerosLiquid, users } = await useInitialSetup();

      await klerosLiquid.changeRNGenerator(users.mock.address);
      expect(await klerosLiquid.RNGenerator()).to.equal(users.mock.address);
    });

    it('Should set new minimum staking time', async () => {
      const { klerosLiquid } = await useInitialSetup();

      const newMinStakingTime = 30;
      await klerosLiquid.changeMinStakingTime(newMinStakingTime);
      expect(await klerosLiquid.minStakingTime()).to.equal(newMinStakingTime);
    });

    it('Should set new maximum drawing time', async () => {
      const { klerosLiquid } = await useInitialSetup();

      const newMaxDrawingTime = 400;
      await klerosLiquid.changeMaxDrawingTime(newMaxDrawingTime);
      expect(await klerosLiquid.maxDrawingTime()).to.equal(newMaxDrawingTime);
    });
  });
});
