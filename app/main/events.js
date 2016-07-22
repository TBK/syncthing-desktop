import { app, BrowserWindow, powerMonitor, ipcMain } from 'electron'
import notify from './utils/notify'
import { getConnections, getMyID, getServiceConfig } from './actions/system'
import { showFolderRejected } from './actions/folder-rejected'
import { getDevice } from './reducers/devices'

export function mainEvents(store) {

  ipcMain.on('ready', (e, winId) => {
    const win = BrowserWindow.fromId(winId)
    win.show()
    win.focus()
    app.dock.show()
  })

  app.on('window-all-closed', () => {
    app.dock.hide()
    if (process.platform !== 'darwin')
      app.quit()
  })

  //Dispatch action on suspension changes
  powerMonitor.on('suspend', () => {
    store.dispatch({ type: 'SUSPEND' })
  })

  //Dispatch action on resumation changes
  powerMonitor.on('resume', () => {
    store.dispatch({ type: 'RESUME' })
  })

  if (process.env.NODE_ENV === 'development') {

    //Listen for hot reloads
    ipcMain.on('renderer-reload', event => {
      delete require.cache[require.resolve('./reducers/index')]
      store.replaceReducer(require('./reducers/index'))
      event.returnValue = true
    })
  }

}

export function stEvents(store){
  //Clear all previous syncthing listeners
  global.st.removeAllListeners('deviceConnected')
  global.st.removeAllListeners('deviceDisconnected')
  global.st.removeAllListeners('error')
  global.st.removeAllListeners('stateChanged')
  global.st.removeAllListeners('configSaved')
  global.st.removeAllListeners('folderSummary')
  global.st.removeAllListeners('folderCompletion')
  global.st.removeAllListeners('folderRejected')

  //Listen for devices connecting
  global.st.on('deviceConnected', ({ id, addr }) => {
    const { name } = getDevice(store.getState(), id)
    notify(`Connected to ${name}`, `on ${addr}`)
    store.dispatch(getConnections())
  })

  //Listen for devices disconnecting
  global.st.on('deviceDisconnected', ({id}) => {
    const { name } = getDevice(store.getState(), id)
    notify(`${name} disconnected`, 'Syncing to this device is paused')
    store.dispatch(getConnections())
  })

  //Listen for connection errors
  global.st.on('error', (error) => {
    store.dispatch({ type: 'CONNECTION_ERROR', error })
  })

  //Listen for folder state changes
  global.st.on('stateChanged', ({ folder, to }) => {
    store.dispatch({
      type: 'FOLDER_STATE_CHANGE',
      payload: to,
      id: folder,
    })
  })

  //Listen for syncthing config changes
  global.st.on('configSaved', () => {
    const myID = store.getState().myID
    store.dispatch(getServiceConfig(myID))
  })

  //Listen for local status changes to folder
  global.st.on('folderSummary', ({folder, summary}) => {
    store.dispatch({
      type: 'FOLDER_STATUS_GET_SUCCESS',
      id: folder,
      payload: summary,
    })
  })

  //Listen for changes in completion
  global.st.on('folderCompletion', ({completion, folder, device}) => {
    store.dispatch({
      type: 'DEVICE_FOLDER_COMPLETION_GET_SUCCESS',
      payload: completion,
      folder,
      device,
    })
  })

  //Listen for new folders shared with the current device
  global.st.on('folderRejected', payload => {
    store.dispatch(showFolderRejected(payload))
    const device = store.getState().devices.devices[payload.device]
    notify(device.name, `wants to share the folder ${payload.folderLabel || payload.folder}.`)
  })

  //Check periodicaly for connections
  setInterval(() => {
    const state = store.getState()
    if(state.power == 'awake'){
      store.dispatch(getMyID())
    }

  }, 5000)

}
