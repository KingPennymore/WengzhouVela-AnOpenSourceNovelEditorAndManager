import { UIAbility, Configuration, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Runtime } from '../services/Runtime';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    Runtime.environment.dark = this.context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
    stage.getMainWindow().then(async (main: window.Window) => {
      Runtime.mainWindow = main;
      await main.setWindowLayoutFullScreen(false);
      await Runtime.applyAppearance(Runtime.environment.dark);
      main.on('avoidAreaChange', () => Runtime.updateInsets());
      main.on('windowSizeChange', () => Runtime.updateInsets());
      await stage.loadContent('pages/Index');
      Runtime.updateInsets();
    }).catch(() => { stage.loadContent('pages/Index'); });
  }

  onConfigurationUpdate(configuration: Configuration): void {
    if (configuration.colorMode !== undefined) {
      Runtime.updateSystemTheme(configuration.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
    }
  }

  onBackground(): void {
    Runtime.flush();
  }

  onWindowStageDestroy(): void {
    Runtime.controller = undefined;
    Runtime.mainWindow?.off('avoidAreaChange');
    Runtime.mainWindow?.off('windowSizeChange');
    Runtime.mainWindow = undefined;
  }
}
