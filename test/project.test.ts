import {assert} from 'chai';

import {useEnvironment,useTronEnvironment} from './helpers';

describe('hardhat-deploy hre extension', function () {
  useEnvironment('hardhat-project', 'hardhat');
  it('It should add the deployments field', function () {
    assert.isNotNull(this.env.deployment);    
  });

  it('The getChainId should give the correct chainId', async function () {
    assert.equal(await this.env.network.config.chainId, '31337');
  });
});


describe('hardhat-deploy hre-tron extension', function () {
  useTronEnvironment('hardhat-project', 'tron');
  it('It should add the deployments field', function () {
    assert.isNotNull(this.env.deployment);    
  });

  it('The Tron network flag should give the correct vaule', async function () {
    assert.equal(await this.env.network.config.tron, true);
  });
});