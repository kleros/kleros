const { expectThrow, waitForMined, increaseTime } = require('kleros-interaction/helpers/utils')
const KlerosPOC = artifacts.require('./KlerosPOC.sol')
const Pinakion = artifacts.require('./PinakionPOC.sol')
const ArbitrableTransaction = artifacts.require('kleros-interaction/ArbitrableTransaction.sol')
const ConstantRandom = artifacts.require('kleros-interaction/ConstantNG.sol')

contract('KlerosPOC', function(accounts) {
    
    let creator = accounts[0]
    
    // Constructor
    it("Should create the contract with the initial values", async () => {
        let pinakion  = await Pinakion.new({from:creator})
        let rng       = await ConstantRandom.new({from:creator})
        let klerosPOC = await KlerosPOC.new(pinakion.address,rng.address,[2,4,8,2,5],{from:creator})
        await pinakion.setKleros(klerosPOC.address,{from:creator})
        await pinakion.transferOwnership(klerosPOC.address,{from:creator})
        
        assert.equal(await klerosPOC.pinakion(), pinakion.address, "The PNK address did not setup properly.")
        assert.equal(await klerosPOC.rng(), rng.address, "The RNG address did not setup properly.")
        assert.equal(await klerosPOC.timePerPeriod(2), 8, "The time period did not setup properly.")
    })
    
    
    
    
})