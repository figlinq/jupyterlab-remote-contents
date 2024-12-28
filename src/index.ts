import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ToolbarButton } from '@jupyterlab/apputils';

import { IFileBrowserFactory, Uploader } from '@jupyterlab/filebrowser';

import { ITranslator } from '@jupyterlab/translation';

import { listIcon, newFolderIcon, refreshIcon } from '@jupyterlab/ui-components';

import { ServerConnection } from './serverconnection';

import { Drive } from './drive';

/**
 * Initialization data for the jupyterlab-remote-contents extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-remote-contents:plugin',
  requires: [IFileBrowserFactory, ITranslator],
  autoStart: true,
  activate: async (
    app: JupyterFrontEnd,
    browser: IFileBrowserFactory,
    translator: ITranslator
  ) => {    
    const { serviceManager } = app;
    const { createFileBrowser } = browser;

    const trans = translator.load('jupyterlab-remote-contents');
    const serverSettings = ServerConnection.makeSettings();
    const drive = new Drive({serverSettings, name: 'Remote'});
    drive.serverSettings.baseUrl = window.location.origin;
    serviceManager.contents.addDrive(drive);

    const widget = createFileBrowser('jp-remote-contents-browser', {
      driveName: drive.name,
      // We don't want to restore old state, we don't have a drive handle ready
      restore: false
    });
    widget.title.icon = listIcon;
    widget.title.caption = trans.__('Figlinq Contents');

    // Go to root directory
    // widget.model.cd('/');
    
    const createNewDirectoryButton = new ToolbarButton({
      icon: newFolderIcon,
      onClick: async () => {
        widget.createNewDirectory();
      },
      tooltip: trans.__('New Folder')
    });

    const uploader = new Uploader({ model: widget.model, translator });

    const refreshButton = new ToolbarButton({
      icon: refreshIcon,
      onClick: async () => {
        widget.model.refresh();
      },
      tooltip: trans.__('Refresh File Browser')
    });

    widget.toolbar.insertItem(1, 'create-new-directory', createNewDirectoryButton);
    widget.toolbar.insertItem(2, 'upload', uploader);
    widget.toolbar.insertItem(3, 'refresh', refreshButton);
    app.shell.add(widget, 'left');
  }
};

export default plugin;
