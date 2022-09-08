const DemoPolicyRegistry = artifacts.require("./kleros/DemoPolicyRegistry.sol");

module.exports = function (deployer) {
    deployer.deploy(
        DemoPolicyRegistry,
        "0x48936cf56a6cc74535c72430f22f54da12ae058e"
    );
};
