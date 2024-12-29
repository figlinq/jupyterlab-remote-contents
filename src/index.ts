import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ToolbarButton } from '@jupyterlab/apputils';

import { IFileBrowserFactory, Uploader } from '@jupyterlab/filebrowser';

import { ITranslator } from '@jupyterlab/translation';

import { folderIcon, newFolderIcon, refreshIcon } from '@jupyterlab/ui-components';
// import { FilenameSearcher, IScore, listIcon, folderIcon, newFolderIcon, refreshIcon } from '@jupyterlab/ui-components';

import { ServerConnection } from './serverconnection';

import { Drive } from './drive';

import { toArray } from '@lumino/algorithm';

/**
 * Initialization data for the jupyterlab-remote-contents extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-remote-contents:plugin',
  requires: [IFileBrowserFactory, ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    browser: IFileBrowserFactory,
    translator: ITranslator
  ) => {
    const { serviceManager } = app;
    const { createFileBrowser } = browser;

    const trans = translator.load('jupyterlab-remote-contents');
    const serverSettings = ServerConnection.makeSettings();
    const drive = new Drive({serverSettings, name: 'Remote', browser});

    serviceManager.contents.addDrive(drive);

    const widget = createFileBrowser('jp-remote-contents-browser', {
      driveName: drive.name,
      // We don't want to restore old state, we don't have a drive handle ready
      restore: false
    });
    widget.title.caption = trans.__('My files');
    widget.title.icon = folderIcon;
    widget.model.cd('/');

    const handleFileBrowser = () => {
      const widgets = toArray(app.shell.widgets('left'));
      const defaultBrowser = widgets.find(widget => widget.id === 'filebrowser');
      if (defaultBrowser) {
        defaultBrowser.dispose();
        app.shell.activateById('jp-remote-contents-browser');
        return true; // Found and handled
      }
      return false; // Not found
    };

    // Disable the default file browser
    // Try finding the file browser immediately
    if (!handleFileBrowser()) {
      // Fallback: Use a periodic timer to check for the file browser
      const interval = setInterval(() => {
        if (handleFileBrowser()) {
          clearInterval(interval); // Stop checking once handled
        }
      }, 100); // Check every 100ms
    }
    
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

    // const searcher = FilenameSearcher({
    //   updateFilter: (
    //     filterFn: (item: string) => Partial<IScore> | null,
    //     query?: string
    //   ) => {
    //     widget.model.setFilter(value => {
    //       return filterFn(value.name.toLowerCase());
    //     });
    //   },
    //   useFuzzyFilter: true,
    //   placeholder: trans.__('Filter files by name'),
    //   forceRefresh: true
    // });

    widget.toolbar.insertItem(1, 'create-new-directory', createNewDirectoryButton);
    widget.toolbar.insertItem(2, 'upload', uploader);
    widget.toolbar.insertItem(3, 'refresh', refreshButton);
    // widget.toolbar.insertItem(4, 'search', searcher);

    app.shell.add(widget, 'left');    
  }
};

export default plugin;
