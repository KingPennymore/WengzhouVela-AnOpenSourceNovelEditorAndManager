import {parseMap} from './map.mjs';
import {renderPlanningSource} from './planning-source.mjs';
export const renderMap=options=>renderPlanningSource({...options,parse:parseMap});
