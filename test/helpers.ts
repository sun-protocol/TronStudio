import {resetHardhatContext} from 'hardhat/plugins-testing';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import path from 'path';

declare module 'mocha' {
  interface Context {
    env: HardhatRuntimeEnvironment;
  }
}

export function useEnvironment(
  fixtureProjectName: string,
  networkName = 'localhost'
): void {
  beforeEach('Loading hardhat environment', function () {
    process.chdir(path.join(__dirname, 'fixture-projects', fixtureProjectName));
    process.env.HARDHAT_NETWORK = networkName;

    try {
      this.env = require('hardhat');
      // console.log(this.env);
    } catch (error) {
      console.error('Failed to load Hardhat environment:', error);
    }
  });

  afterEach('Resetting hardhat', function () {
    resetHardhatContext();
  });
}

export function useTronEnvironment(
  fixtureProjectName: string,
  networkName = 'tron'
): void {
  beforeEach('Loading hardhat environment', function () {
    process.chdir(path.join(__dirname, 'fixture-projects', fixtureProjectName));
    process.env.HARDHAT_NETWORK = networkName;

    try {
      this.env = require('hardhat');
      // console.log(this.env);
      
    } catch (error) {
      console.error('Failed to load Hardhat environment:', error);
    }
  });

  afterEach('Resetting hardhat', function () {
    resetHardhatContext();
  });
}