// @flow
import { ipcRenderer } from 'electron';
import * as childProcess from 'child_process';
import * as path from 'path';
import {
  RUN_TASK,
  ABORT_TASK,
  COMPLETE_TASK,
  LAUNCH_DEV_SERVER,
  completeTask,
  attachTaskMetadata,
  receiveDataFromTaskExecution,
  loadDependencyInfoFromDisk,
} from '../actions';
import { getProjectById } from '../reducers/projects.reducer';
import { getPathForProjectId } from '../reducers/paths.reducer';
import { isDevServerTask } from '../reducers/tasks.reducer';
import findAvailablePort from '../services/find-available-port.service';
import killProcessId from '../services/kill-process-id.service';
import { isWin, PACKAGE_MANAGER_CMD } from '../services/platform.service';

import type { Task } from '../types';

export default (store: any) => (next: any) => (action: any) => {
  if (!action.task) {
    return next(action);
  }

  const { task } = action;

  const state = store.getState();

  const project = getProjectById(state, task.projectId);
  const projectPath = getPathForProjectId(state, task.projectId);

  // eslint-disable-next-line default-case
  switch (action.type) {
    case LAUNCH_DEV_SERVER: {
      findAvailablePort()
        .then(port => {
          const { args, env } = getDevServerCommand(task, port);

          const child = childProcess.spawn(PACKAGE_MANAGER_CMD, args, {
            cwd: projectPath,
            env: {
              ...getBaseProjectEnvironment(projectPath),
              ...env,
            },
          });

          // Now that we have a port/processId for the server, attach it to
          // the task. The port is used for opening the app, the pid is used
          // to kill the process
          next(attachTaskMetadata(task, child.pid, port));

          ipcRenderer.send('addProcessId', child.pid);

          child.stdout.on('data', data => {
            // Ok so, unfortunately, failure-to-compile is still pushed
            // through stdout, not stderr. We want that message specifically
            // to trigger an error state, and so we need to parse it.
            const text = data.toString();

            const isError = text.includes('Failed to compile.');

            next(receiveDataFromTaskExecution(task, text, isError));
          });

          child.stderr.on('data', data => {
            next(receiveDataFromTaskExecution(task, data.toString()));
          });

          child.on('exit', code => {
            // For Windows Support
            // Windows sends code 1 (I guess its because we foce kill??)
            const successfulCode = isWin ? 1 : 0;
            const wasSuccessful = code === successfulCode || code === null;
            const timestamp = new Date();

            store.dispatch(completeTask(task, timestamp, wasSuccessful));
          });
        })
        .catch(err => {
          // TODO: Error handling (this can happen if the first 15 ports are
          // occupied, or if there's some generic Node error)
          console.error(err);
        });

      break;
    }

    // TODO: As tasks start to get more customized for the project types,
    // it probably makes sense to have separate actions (eg. RUN_TESTS,
    // BUILD_FOR_PRODUCTION), and use RUN_TASK just for user-added tasks.
    case RUN_TASK: {
      const { name } = task;

      const child = childProcess.spawn(PACKAGE_MANAGER_CMD, ['run', name], {
        cwd: projectPath,
        env: getBaseProjectEnvironment(projectPath),
      });

      // When this application exits, we want to kill this process.
      // Send it up to the main process.
      ipcRenderer.send('addProcessId', child.pid);

      // TODO: Does the renderer process still need to know about the child
      // processId?
      next(attachTaskMetadata(task, child.pid));

      child.stdout.on('data', data => {
        next(receiveDataFromTaskExecution(task, data.toString()));
      });

      child.stderr.on('data', data => {
        next(receiveDataFromTaskExecution(task, data.toString()));
      });

      child.on('exit', code => {
        const timestamp = new Date();

        store.dispatch(completeTask(task, timestamp, code === 0));

        if (task.name === 'eject') {
          store.dispatch(loadDependencyInfoFromDisk(project.id, project.path));
        }
      });

      break;
    }

    case ABORT_TASK: {
      const { processId, name } = task;

      killProcessId(processId);
      ipcRenderer.send('removeProcessId', processId);

      // Once the task is killed, we should dispatch a notification
      // so that the terminal shows something about this update.
      // My initial thought was that all tasks would have the same message,
      // but given that we're treating `start` as its own special thing,
      // I'm realizing that it should vary depending on the task type.
      // TODO: Find a better place for this to live.
      const abortMessage = isDevServerTask(name)
        ? 'Server stopped'
        : 'Task aborted';

      next(
        receiveDataFromTaskExecution(
          task,
          `\u001b[31;1m${abortMessage}\u001b[0m`
        )
      );

      break;
    }

    case COMPLETE_TASK: {
      // Send a message to add info to the terminal about the task being done.
      // TODO: ASCII fish art?

      const message = 'Task completed';

      next(
        receiveDataFromTaskExecution(task, `\u001b[32;1m${message}\u001b[0m`)
      );

      if (task.processId) {
        ipcRenderer.send('removeProcessId', task.processId);
      }

      // The `eject` task is special; after running it, its dependencies will
      // have changed.
      // TODO: We should really have a `EJECT_PROJECT_COMPLETE` action that does
      // this instead.
      if (task.name === 'eject') {
        const project = getProjectById(store.getState(), task.projectId);

        store.dispatch(loadDependencyInfoFromDisk(project.id, project.path));
      }

      break;
    }
  }

  // Pass all actions through, unless the function returns early (which happens
  // when deferring the 'eject' task)
  return next(action);
};

const getBaseProjectEnvironment = (projectPath: string) => ({
  // Forward the host env, and append the
  // project's .bin directory to PATH to allow
  // package scripts to function properly.
  ...window.process.env,
  PATH:
    window.process.env.PATH +
    path.delimiter +
    path.join(projectPath, 'node_modules', '.bin'),
});

const getDevServerCommand = (task: Task, port: string) => {
  return {
    args: ['run', task.name],
    env: {
      PORT: port,
    },
  };
};

const sendCommandToProcess = (child: any, command: string) => {
  // Commands have to be suffixed with '\n' to signal that the command is
  // ready to be sent. Same as a regular command + hitting the enter key.
  child.stdin.write(`${command}\n`);
};
