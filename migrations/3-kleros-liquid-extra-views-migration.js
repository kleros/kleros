const KlerosLiquidExtraViews = artifacts.require("./KlerosLiquidExtraViews.sol");

const KlerosLiquidAddress = "0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069";

module.exports = async function(deployer, network) {
  if (network == "test") {
    return
  }
  const ExtraViewsInstance = await deployer.deploy(
    KlerosLiquidExtraViews,
    KlerosLiquidAddress
  );

  console.log('Deployed Extra Views: ', ExtraViewsInstance.address);
};