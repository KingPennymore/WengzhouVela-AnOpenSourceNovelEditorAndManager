import {parseOutline} from './outline.mjs';
import {renderPlanningSource} from './planning-source.mjs';
export const renderOutline=options=>renderPlanningSource({...options,parse:parseOutline});
