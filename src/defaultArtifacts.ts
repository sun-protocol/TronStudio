import * as ea from '../extendedArtifacts';
import * as eaT from '../extendedArtifactsTron';
import {ExtendedArtifact} from '../types';

type DefaultArtifactsName = keyof typeof ea & keyof typeof eaT;
type DefaultArtifacts = {[key in DefaultArtifactsName]: ExtendedArtifact};

/*
const isArtifactName = (
  name: string,
  artifacts: DefaultArtifacts
): name is DefaultArtifactsName => name in artifacts;
*/

export const getDefaultArtifact = (
  name: string | DefaultArtifactsName,
  tron: boolean
): ExtendedArtifact => {
  let artifacts: DefaultArtifacts = ea;
  if (tron) artifacts = eaT;

  switch (name) {
    case 'EIP173ProxyWithReceive':
      return artifacts.EIP173ProxyWithReceive;
    case 'EIP173Proxy':
      return artifacts.EIP173Proxy;
    case 'OpenZeppelinTransparentProxy':
      return artifacts.TransparentUpgradeableProxy;
    case 'OptimizedTransparentProxy':
      return artifacts.OptimizedTransparentUpgradeableProxy;
    case 'UUPS':
      return artifacts.ERC1967Proxy;
    case 'DefaultProxyAdmin':
      return artifacts.ProxyAdmin;
    case 'DiamondBase':
      return artifacts.Diamond;
    case 'DiamondERC165Init':
      return artifacts.DiamondERC165Init;
    case 'DiamondCutFacet':
      return artifacts.DiamondCutFacet;
    case 'OwnershipFacet':
      return artifacts.OwnershipFacet;
    case 'DiamondLoupeFacet':
      return artifacts.DiamondLoupeFacet;
    default:
      /*
       * For added safety, we will disable the option of returning an artifact
       * that hasn't been expressly listed above.
       * The following line can be used for such functionality if needed in the future:
       * if (isArtifactName(name, artifacts)) return artifacts[name];
       */
      throw new Error(`default artifact not found for ${name}`);
  }
};
