// @flow
/**
 * Customize the application menu (file/edit/etc outside of the window).
 */
import { Component } from 'react';
import { connect } from 'react-redux';
import { shell, remote } from 'electron';

import * as actions from '../../actions';
import { SKPM_REPO_URL } from '../../constants';
import {
  isMac,
  getCopyForOpeningFolder,
} from '../../services/platform.service';
import {
  openProjectInFolder,
  openProjectInEditor,
} from '../../services/shell.service';
import {
  getSelectedProject,
  getProjectsArray,
} from '../../reducers/projects.reducer';
import { getDevServerTaskForProjectId } from '../../reducers/tasks.reducer';

import type { Project, Task } from '../../types';
import type { Dispatch } from '../../actions/types';

const { app, process, Menu } = remote;

type Props = {
  projects: Array<Project>,
  selectedProject: ?Project,
  devServerTask: ?Task,
  createNewProjectStart: Dispatch<typeof actions.createNewProjectStart>,
  showImportExistingProjectPrompt: Dispatch<
    typeof actions.showImportExistingProjectPrompt
  >,
  clearConsole: Dispatch<typeof actions.clearConsole>,
  showDeleteProjectPrompt: Dispatch<typeof actions.showDeleteProjectPrompt>,
  showResetStatePrompt: Dispatch<typeof actions.showResetStatePrompt>,
  showProjectSettings: Dispatch<typeof actions.showProjectSettings>,
  showAppSettings: Dispatch<typeof actions.showAppSettings>,
  selectProject: Dispatch<typeof actions.selectProject>,
};

class ApplicationMenu extends Component<Props> {
  menu: any;

  componentDidMount() {
    this.buildMenu(this.props);
  }

  componentDidUpdate(prevProps) {
    if (this.props.selectedProject !== prevProps.selectedProject) {
      this.buildMenu(this.props);
    }
  }

  openGithubLink = pathname => {
    shell.openExternal(`${SKPM_REPO_URL}/${pathname}`);
  };

  buildMenu = (props: Props) => {
    const {
      selectedProject,
      devServerTask,
      createNewProjectStart,
      showImportExistingProjectPrompt,
      clearConsole,
      showDeleteProjectPrompt,
      showResetStatePrompt,
      showProjectSettings,
      showAppSettings,
      selectProject,
      projects,
    } = props;

    const template = [
      {
        id: 'file',
        label: isMac ? 'File' : '&File',
        submenu: [
          {
            label: isMac ? 'Create New Project' : 'Create &new project',
            click: createNewProjectStart,
            accelerator: 'CmdOrCtrl+N',
          },
          {
            label: isMac
              ? 'Import Existing Project...'
              : '&Import existing project...',
            click: showImportExistingProjectPrompt,
            accelerator: 'CmdOrCtrl+I',
          },
        ],
      },
      {
        id: 'edit',
        label: isMac ? 'Edit' : '&Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'delete' },
          { role: 'selectall', label: isMac ? 'Select All' : 'Select all' },
        ],
      },
      {
        id: 'view',
        label: isMac ? 'View' : '&View',
        submenu: [
          { role: 'reload' },
          {
            role: 'forcereload',
            label: isMac ? 'Force Reload' : 'Force reload',
          },
          { type: 'separator' },
          { role: 'resetzoom', label: isMac ? 'Actual Size' : 'Actual size' },
          { role: 'zoomin', label: isMac ? 'Zoom In' : 'Zoom in' },
          { role: 'zoomout', label: isMac ? 'Zoom Out' : 'Zoom out' },
          { type: 'separator' },
          {
            role: 'togglefullscreen',
            label: isMac ? 'Toggle Full Screen' : 'Toggle full screen',
          },
        ],
      },
      {
        id: 'development',
        label: isMac ? 'Development' : '&Development',
        submenu: [
          {
            role: 'toggledevtools',
            label: isMac ? 'Toggle Developer Tools' : 'Toggle developer tools',
          },
          {
            label: isMac ? 'Reset State...' : 'Reset state...',
            click: showResetStatePrompt,
          },
        ],
      },
      {
        id: 'help',
        label: isMac ? 'Help' : '&Help',
        submenu: [
          {
            label: isMac ? 'Getting Started' : 'Getting started',
            click: () =>
              this.openGithubLink('blob/skpm/docs/getting-started.md'),
          },
          {
            label: isMac ? 'Report an Issue' : 'Report an issue',
            click: () => this.openGithubLink('issues/new/choose'),
          },
          {
            label: isMac ? 'Privacy Policy' : 'Privacy policy',
            click: () => this.openGithubLink('blob/skpm/PRIVACY.md'),
          },
        ],
      },
    ];

    // Add preferences menu item for Linux/Windows
    if (!isMac) {
      template[0].submenu.push({
        // Linux & Windows only
        label: '&Preferences...',
        click: showAppSettings,
        accelerator: 'Ctrl+,',
      });
    }

    // MacOS menus start with the app name (Guppy) and offer some standard
    // options:
    if (process.platform === 'darwin') {
      template.unshift({
        id: 'skpm',
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideothers' },
          { role: 'unhide' },
          {
            label: 'Preferences...',
            click: showAppSettings,
            accelerator: 'CmdOrCtrl+,',
          },
          { type: 'separator' },
          { role: 'quit' },
        ],
      });
    }

    // During onboarding, there is no selected project (because none exists
    // yet). Therefore, we only want to show the 'Project' menu when a project
    // is selected.
    if (selectedProject) {
      // The `Project` menu should be inserted right after `Edit`, which will
      // have a different index depending on the platform.
      const editMenuIndex = template.findIndex(menu => menu.id === 'edit');

      const openFolderCopy = getCopyForOpeningFolder();

      let submenu = [
        {
          label: openFolderCopy,
          click: () => openProjectInFolder(selectedProject),
          accelerator: 'CmdOrCtrl+shift+F',
        },
        {
          label: isMac ? 'Open in Code Editor' : 'Open in code editor',
          click: () => openProjectInEditor(selectedProject),
          accelerator: 'CmdOrCtrl+shift+E',
        },
        {
          label: isMac ? 'Open Settings' : 'Open settings',
          click: () => showProjectSettings(),
          accelerator: 'CmdOrCtrl+shift+,',
        },
        { type: 'separator' },
      ];

      // If this project has no devServerTask, there are no logs to clear.
      if (devServerTask) {
        submenu.push({
          label: isMac ? 'Clear Plugin Logs' : 'Clear plugin logs',
          click: () => clearConsole(devServerTask),
          accelerator: 'CmdOrCtrl+K',
        });
      }

      submenu.push({
        label: isMac ? 'Delete Plugin' : 'Delete plugin',
        click: () => showDeleteProjectPrompt(selectedProject),
      });

      submenu.push({ type: 'separator' });

      // Checking projects length not needed as we're having more than one project if the Current Project menu is available
      submenu.push({
        label: isMac ? 'Select Plugin' : 'Select plugin',
        id: 'select-project',
        submenu: createProjectSelectionSubmenu(
          projects,
          selectedProject.id,
          selectProject
        ),
      });

      template.splice(editMenuIndex, 0, {
        id: 'current-project',
        label: isMac ? 'Current Plugin' : 'Current &plugin',
        submenu,
      });
    }

    this.menu = Menu.buildFromTemplate(template);

    Menu.setApplicationMenu(this.menu);
  };

  render() {
    return null;
  }
}

// helpers
export const createProjectSelectionSubmenu = (
  projects: Array<Project>,
  selectedProjectId: string,
  selectProject: (id: string) => any
): any => {
  const isSelected = testId => testId === selectedProjectId;

  return projects.map(({ name, id }) => ({
    label: name,
    type: isSelected(id) ? 'checkbox' : 'normal',
    checked: isSelected(id),
    click: () => selectProject(id),
  }));
};

const mapStateToProps = state => {
  const selectedProject = getSelectedProject(state);

  const devServerTask = selectedProject
    ? getDevServerTaskForProjectId(state, {
        projectId: selectedProject.id,
        projectType: 'empty',
      })
    : null;

  const projects = getProjectsArray(state);
  return { selectedProject, devServerTask, projects };
};

const mapDispatchToProps = {
  createNewProjectStart: actions.createNewProjectStart,
  showImportExistingProjectPrompt: actions.showImportExistingProjectPrompt,
  clearConsole: actions.clearConsole,
  showDeleteProjectPrompt: actions.showDeleteProjectPrompt,
  showResetStatePrompt: actions.showResetStatePrompt,
  showProjectSettings: actions.showProjectSettings,
  showAppSettings: actions.showAppSettings,
  selectProject: actions.selectProject,
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(ApplicationMenu);
