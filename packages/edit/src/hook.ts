import { nextTick } from 'vue'
import XEUtils from 'xe-utils/ctor'
import VXETable from '../../v-x-e-table'
import { UtilTools, DomTools } from '../../tools'

import { VxeGlobalHooksHandles, TableEditMethods, TableEditPrivateMethods } from '../../../types/vxe-table'

const tableEditMethodKeys: (keyof TableEditMethods)[] = ['insert', 'insertAt', 'remove', 'removeCheckboxRow', 'removeRadioRow', 'removeCurrentRow', 'getRecordset', 'getInsertRecords', 'getRemoveRecords', 'getUpdateRecords', 'getActiveRecord', 'getSelectedCell', 'clearActived', 'clearSelected', 'isActiveByRow', 'setActiveRow', 'setActiveCell', 'setSelectCell']

const editHook: VxeGlobalHooksHandles.HookOptions = {
  setupTable ($xetable) {
    const { props, reactData, internalData, refMaps, computeMaps } = $xetable
    const { refElem } = refMaps
    const { computeMouseOpts, computeEditOpts, computeCheckboxOpts, computeSYOpts, computeTreeOpts } = computeMaps

    let editMethods = {} as TableEditMethods
    let editPrivateMethods = {} as TableEditPrivateMethods

    const getEditColumnModel = (row: any, column: any) => {
      const { model, editRender } = column
      if (editRender) {
        model.value = UtilTools.getCellValue(row, column)
        model.update = false
      }
    }

    const setEditColumnModel = (row: any, column: any) => {
      const { model, editRender } = column
      if (editRender && model.update) {
        UtilTools.setCellValue(row, column, model.value)
        model.update = false
        model.value = null
      }
    }

    const removeCellSelectedClass = () => {
      const el = refElem.value
      const cell = el.querySelector('.col--selected')
      if (cell) {
        DomTools.removeClass(cell, 'col--selected')
      }
    }

    editMethods = {
      /**
       * 往表格中插入临时数据
       *
       * @param {*} records
       */
      insert (records: any) {
        return editMethods.insertAt(records, null)
      },
      /**
       * 往表格指定行中插入临时数据
       * 如果 row 为空则从插入到顶部
       * 如果 row 为 -1 则从插入到底部
       * 如果 row 为有效行则插入到该行的位置
       * @param {Object/Array} records 新的数据
       * @param {Row} row 指定行
       */
      insertAt (records: any, row: any) {
        const { treeConfig } = props
        const { mergeList, editStore, scrollYLoad } = reactData
        const { afterFullData, tableFullData } = internalData
        const sYOpts = computeSYOpts.value
        if (!XEUtils.isArray(records)) {
          records = [records]
        }
        const newRecords = records.map((record: any) => $xetable.defineField(Object.assign({}, record)))
        if (!row) {
          afterFullData.unshift(...newRecords)
          tableFullData.unshift(...newRecords)
          // 刷新单元格合并
          mergeList.forEach((mergeItem: any) => {
            const { row: mergeRowIndex } = mergeItem
            if (mergeRowIndex > 0) {
              mergeItem.row = mergeRowIndex + newRecords.length
            }
          })
        } else {
          if (row === -1) {
            afterFullData.push(...newRecords)
            tableFullData.push(...newRecords)
            // 刷新单元格合并
            mergeList.forEach((mergeItem: any) => {
              const { row: mergeRowIndex, rowspan: mergeRowspan } = mergeItem
              if (mergeRowIndex + mergeRowspan > afterFullData.length) {
                mergeItem.rowspan = mergeRowspan + newRecords.length
              }
            })
          } else {
            if (treeConfig) {
              throw new Error(UtilTools.getLog('vxe.error.noTree', ['insert']))
            }
            const afIndex = afterFullData.indexOf(row)
            if (afIndex === -1) {
              throw new Error(UtilTools.error('vxe.error.unableInsert'))
            }
            afterFullData.splice(afIndex, 0, ...newRecords)
            tableFullData.splice(tableFullData.indexOf(row), 0, ...newRecords)
            // 刷新单元格合并
            mergeList.forEach((mergeItem: any) => {
              const { row: mergeRowIndex, rowspan: mergeRowspan } = mergeItem
              if (mergeRowIndex > afIndex) {
                mergeItem.row = mergeRowIndex + newRecords.length
              } else if (mergeRowIndex + mergeRowspan > afIndex) {
                mergeItem.rowspan = mergeRowspan + newRecords.length
              }
            })
          }
        }
        editStore.insertList.unshift(...newRecords)
        reactData.scrollYLoad = !treeConfig && sYOpts.gt > -1 && sYOpts.gt < tableFullData.length
        $xetable.handleTableData()
        $xetable.updateFooter()
        $xetable.updateCache()
        $xetable.checkSelectionStatus()
        if (scrollYLoad) {
          $xetable.updateScrollYSpace()
        }
        return nextTick().then(() => {
          $xetable.recalculate()
          return {
            row: newRecords.length ? newRecords[newRecords.length - 1] : null,
            rows: newRecords
          }
        })
      },
      /**
       * 删除指定行数据
       * 如果传 row 则删除一行
       * 如果传 rows 则删除多行
       * 如果为空则删除所有
       */
      remove (rows: any) {
        const { treeConfig } = props
        const { mergeList, editStore, selection, scrollYLoad } = reactData
        const { afterFullData, tableFullData } = internalData
        const checkboxOpts = computeCheckboxOpts.value
        const sYOpts = computeSYOpts.value
        const { actived, removeList, insertList } = editStore
        const { checkField: property } = checkboxOpts
        let rest: any[] = []
        if (!rows) {
          rows = tableFullData
        } else if (!XEUtils.isArray(rows)) {
          rows = [rows]
        }
        // 如果是新增，则保存记录
        rows.forEach((row: any) => {
          if (!$xetable.isInsertByRow(row)) {
            removeList.push(row)
          }
        })
        // 如果绑定了多选属性，则更新状态
        if (!property) {
          rows.forEach((row: any) => {
            const sIndex = selection.indexOf(row)
            if (sIndex > -1) {
              selection.splice(sIndex, 1)
            }
          })
        }
        // 从数据源中移除
        if (tableFullData === rows) {
          rows = rest = tableFullData.slice(0)
          internalData.tableFullData = []
          internalData.afterFullData = []
          $xetable.clearMergeCells()
        } else {
          rows.forEach((row: any) => {
            const tfIndex = tableFullData.indexOf(row)
            if (tfIndex > -1) {
              const rItems = tableFullData.splice(tfIndex, 1)
              rest.push(rItems[0])
            }
            const afIndex = afterFullData.indexOf(row)
            if (afIndex > -1) {
              // 刷新单元格合并
              mergeList.forEach((mergeItem: any) => {
                const { row: mergeRowIndex, rowspan: mergeRowspan } = mergeItem
                if (mergeRowIndex > afIndex) {
                  mergeItem.row = mergeRowIndex - 1
                } else if (mergeRowIndex + mergeRowspan > afIndex) {
                  mergeItem.rowspan = mergeRowspan - 1
                }
              })
              afterFullData.splice(afIndex, 1)
            }
          })
        }
        // 如果当前行被激活编辑，则清除激活状态
        if (actived.row && rows.indexOf(actived.row) > -1) {
          editMethods.clearActived()
        }
        // 从新增中移除已删除的数据
        rows.forEach((row: any) => {
          const iIndex = insertList.indexOf(row)
          if (iIndex > -1) {
            insertList.splice(iIndex, 1)
          }
        })
        reactData.scrollYLoad = !treeConfig && sYOpts.gt > -1 && sYOpts.gt < tableFullData.length
        $xetable.handleTableData()
        $xetable.updateFooter()
        $xetable.updateCache()
        $xetable.checkSelectionStatus()
        if (scrollYLoad) {
          $xetable.updateScrollYSpace()
        }
        return nextTick().then(() => {
          $xetable.recalculate()
          return { row: rest.length ? rest[rest.length - 1] : null, rows: rest }
        })
      },
      /**
       * 删除复选框选中的数据
       */
      removeCheckboxRow () {
        return editMethods.remove($xetable.getCheckboxRecords()).then((params: any) => {
          $xetable.clearCheckboxRow()
          return params
        })
      },
      /**
       * 删除单选框选中的数据
       */
      removeRadioRow () {
        const radioRecord = $xetable.getRadioRecord()
        return editMethods.remove(radioRecord || []).then((params: any) => {
          $xetable.clearRadioRow()
          return params
        })
      },
      /**
       * 删除当前行选中的数据
       */
      removeCurrentRow () {
        const currentRecord = $xetable.getCurrentRecord()
        return editMethods.remove(currentRecord || []).then((params: any) => {
          $xetable.clearCurrentRow()
          return params
        })
      },
      /**
       * 获取表格数据集，包含新增、删除、修改
       */
      getRecordset () {
        return {
          insertRecords: editMethods.getInsertRecords(),
          removeRecords: editMethods.getRemoveRecords(),
          updateRecords: editMethods.getUpdateRecords()
        }
      },
      /**
       * 获取新增的临时数据
       */
      getInsertRecords () {
        const { editStore } = reactData
        const { tableFullData } = internalData
        const insertList = editStore.insertList
        const insertRecords: any[] = []
        if (insertList.length) {
          tableFullData.forEach((row: any) => {
            if (insertList.indexOf(row) > -1) {
              insertRecords.push(row)
            }
          })
        }
        return insertRecords
      },
      /**
       * 获取已删除的数据
       */
      getRemoveRecords () {
        const { editStore } = reactData
        return editStore.removeList
      },
      /**
       * 获取更新数据
       * 只精准匹配 row 的更改
       * 如果是树表格，子节点更改状态不会影响父节点的更新状态
       */
      getUpdateRecords () {
        const { keepSource, treeConfig } = props
        const { tableFullData } = internalData
        const treeOpts = computeTreeOpts.value
        if (keepSource) {
          if (treeConfig) {
            return XEUtils.filterTree(tableFullData, row => $xetable.isUpdateByRow(row), treeOpts)
          }
          return tableFullData.filter((row: any) => $xetable.isUpdateByRow(row))
        }
        return []
      },
      getActiveRecord () {
        const { editStore } = reactData
        const { afterFullData } = internalData
        const el = refElem.value
        const { args, row } = editStore.actived
        if (args && afterFullData.indexOf(row) > -1 && el.querySelectorAll('.vxe-body--column.col--actived').length) {
          return Object.assign({}, args)
        }
        return null
      },
      /**
       * 获取选中的单元格
       */
      getSelectedCell () {
        const { editStore } = reactData
        const { args, column } = editStore.selected
        if (args && column) {
          return Object.assign({}, args)
        }
        return null
      },
      /**
       * 清除激活的编辑
       */
      clearActived (evnt) {
        const { editStore, tableColumn } = reactData
        const editOpts = computeEditOpts.value
        const { actived } = editStore
        const { args, row, column } = actived
        if (row || column) {
          if (editOpts.mode === 'row') {
            tableColumn.forEach((column: any) => setEditColumnModel(row, column))
          } else {
            setEditColumnModel(row, column)
          }
          $xetable.updateFooter()
          $xetable.dispatchEvent('edit-closed', args, evnt || null)
        }
        actived.args = null
        actived.row = null
        actived.column = null
        return ($xetable.clearValidate ? $xetable.clearValidate() : nextTick()).then(() => $xetable.recalculate())
      },
      /**
       * 清除所选中源状态
       */
      clearSelected () {
        const { editStore } = reactData
        const { selected } = editStore
        selected.row = null
        selected.column = null
        removeCellSelectedClass()
        return nextTick()
      },
      /**
       * 判断行是否为激活编辑状态
       * @param {Row} row 行对象
       */
      isActiveByRow (row) {
        const { editStore } = reactData
        return editStore.actived.row === row
      },
      /**
       * 激活行编辑
       */
      setActiveRow (row) {
        const { visibleColumn } = internalData
        return $xetable.setActiveCell(row, XEUtils.find(visibleColumn, column => column.editRender).property)
      },
      /**
       * 激活单元格编辑
       */
      setActiveCell (row, field) {
        const { visibleColumn } = internalData
        if (row && field) {
          const column = XEUtils.find(visibleColumn, column => column.property === field)
          return $xetable.scrollToRow(row, column).then(() => {
            if (column && column.editRender) {
              const cell = $xetable.getCell(row, column)
              if (cell) {
                editPrivateMethods.handleActived({ row, rowIndex: $xetable.getRowIndex(row), column, columnIndex: $xetable.getColumnIndex(column), cell, $table: $xetable })
                internalData._lastCallTime = Date.now()
              }
            }
            return nextTick()
          })
        }
        return nextTick()
      },
      /**
       * 只对 trigger=dblclick 有效，选中单元格
       */
      setSelectCell (row, field) {
        const { tableData } = reactData
        const { visibleColumn } = internalData
        const editOpts = computeEditOpts.value
        if (row && field && editOpts.trigger !== 'manual') {
          const column = XEUtils.find(visibleColumn, column => column.property === field)
          const rowIndex = tableData.indexOf(row)
          if (rowIndex > -1 && column) {
            const cell = $xetable.getCell(row, column)
            const params = { row, rowIndex, column, columnIndex: visibleColumn.indexOf(column), cell }
            $xetable.handleSelected(params, {})
          }
        }
        return nextTick()
      }
    }

    editPrivateMethods = {
      /**
       * 处理激活编辑
       */
      handleActived (params, evnt) {
        const { mouseConfig } = props
        const { editStore, tableColumn } = reactData
        const editOpts = computeEditOpts.value
        const { mode, activeMethod } = editOpts
        const { actived } = editStore
        const { row, column, cell } = params
        const { editRender } = column
        if (editRender && cell) {
          if (actived.row !== row || (mode === 'cell' ? actived.column !== column : false)) {
            // 判断是否禁用编辑
            let type: 'edit-disabled' | 'edit-actived' = 'edit-disabled'
            if (!activeMethod || activeMethod(params)) {
              if (mouseConfig) {
                editMethods.clearSelected()
                if ($xetable.clearCellAreas) {
                  $xetable.clearCellAreas()
                  $xetable.clearCopyCellArea()
                }
              }
              $xetable.clostTooltip()
              editMethods.clearActived(evnt)
              type = 'edit-actived'
              column.renderHeight = cell.offsetHeight
              actived.args = params
              actived.row = row
              actived.column = column
              if (mode === 'row') {
                tableColumn.forEach((column: any) => getEditColumnModel(row, column))
              } else {
                getEditColumnModel(row, column)
              }
              nextTick(() => {
                editPrivateMethods.handleFocus(params, evnt)
              })
            }
            $xetable.dispatchEvent(type, params, evnt)
          } else {
            const { column: oldColumn } = actived
            if (mouseConfig) {
              editMethods.clearSelected()
              if ($xetable.clearCellAreas) {
                $xetable.clearCellAreas()
                $xetable.clearCopyCellArea()
              }
            }
            if (oldColumn !== column) {
              const { model: oldModel } = oldColumn
              if (oldModel.update) {
                UtilTools.setCellValue(row, oldColumn, oldModel.value)
              }
              if ($xetable.clearValidate) {
                $xetable.clearValidate()
              }
            }
            column.renderHeight = cell.offsetHeight
            actived.args = params
            actived.column = column
            setTimeout(() => {
              editPrivateMethods.handleFocus(params, evnt)
            })
          }
          $xetable.focus()
        }
        return nextTick()
      },
      /**
       * 处理聚焦
       */
      handleFocus (params) {
        const { row, column, cell } = params
        const { editRender } = column
        if (editRender) {
          const compRender = VXETable.renderer.get(editRender.name)
          const { autofocus, autoselect } = editRender
          let inputElem
          // 如果指定了聚焦 class
          if (autofocus) {
            inputElem = cell.querySelector(autofocus)
          }
          // 渲染器的聚焦处理
          if (!inputElem && compRender && compRender.autofocus) {
            inputElem = cell.querySelector(compRender.autofocus)
          }
          if (inputElem) {
            inputElem.focus()
            if (autoselect) {
              inputElem.select()
            } else {
              // 保持一致行为，光标移到末端
              if (DomTools.browse.msie) {
                const textRange = inputElem.createTextRange()
                textRange.collapse(false)
                textRange.select()
              }
            }
          } else {
            // 显示到可视区中
            $xetable.scrollToRow(row, column)
          }
        }
      },
      /**
       * 处理选中源
       */
      handleSelected (params, evnt) {
        const { mouseConfig } = props
        const { editStore } = reactData
        const mouseOpts = computeMouseOpts.value
        const editOpts = computeEditOpts.value
        const { actived, selected } = editStore
        const { row, column } = params
        const isMouseSelected = mouseConfig && mouseOpts.selected
        const selectMethod = () => {
          if (isMouseSelected && (selected.row !== row || selected.column !== column)) {
            if (actived.row !== row || (editOpts.mode === 'cell' ? actived.column !== column : false)) {
              editMethods.clearActived(evnt)
              editMethods.clearSelected()
              if ($xetable.clearCellAreas) {
                $xetable.clearCellAreas()
                $xetable.clearCopyCellArea()
              }
              selected.args = params
              selected.row = row
              selected.column = column
              if (isMouseSelected) {
                editPrivateMethods.addCellSelectedClass()
              }
              $xetable.focus()
            }
          }
          return nextTick()
        }
        return selectMethod()
      },
      addCellSelectedClass () {
        const { editStore } = reactData
        const { selected } = editStore
        const { row, column } = selected
        removeCellSelectedClass()
        if (row && column) {
          const cell = $xetable.getCell(row, column)
          if (cell) {
            DomTools.addClass(cell, 'col--selected')
          }
        }
      }
    }

    return { ...editMethods, ...editPrivateMethods }
  },
  setupGrid ($xegrid) {
    return $xegrid.extendTableMethods(tableEditMethodKeys)
  }
}

export default editHook
