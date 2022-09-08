const DemoExtraViews = artifacts.require("./kleros/DemoExtraViews.sol");

const KlerosDemoCourtAddress = "0x90E19c4df5401c6E4196715aAf3335b85d98AD84";

module.exports = async function (deployer, network) {
    if (network == "test") {
        return;
    }
    const ExtraViewsInstance = await deployer.deploy(
        DemoExtraViews,
        KlerosDemoCourtAddress
    );

    console.log("Deployed Extra Views: ", ExtraViewsInstance.address);
};
