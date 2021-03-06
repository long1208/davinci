/*
 * <<
 * Davinci
 * ==
 * Copyright (C) 2016 - 2017 EDP
 * ==
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * >>
 */

import { IChartProps } from '../../components/Chart'
import {
  decodeMetricName,
  getChartTooltipLabel,
  getTextWidth,
  getSizeRate
} from '../../components/util'
import {
  getLegendOption,
  getLabelOption,
  getGridPositions,
  getSymbolSize
} from './util'
import {
  safeAddition
} from '../../../../utils/util'

import {
  DEFAULT_ECHARTS_THEME
} from '../../../../globalConstants'
import geoData from '../../../../assets/json/geo'

const provinceSuffix = ['省', '自治区', '市']
const citySuffix = ['自治州', '市', '区', '县', '旗', '盟', '镇']

export default function (chartProps: IChartProps) {
  const {
    chartStyles,
    data,
    cols,
    metrics,
    model
  } = chartProps

  const {
    label,
    spec
  } = chartStyles

  const {
    labelColor,
    labelFontFamily,
    labelFontSize,
    labelPosition,
    showLabel
  } = label

  const {
    layerType,
    roam
  } = spec

  const labelOption = {
    label: {
      normal: {
        formatter: '{b}',
        position: labelPosition,
        show: showLabel,
        color: labelColor,
        fontFamily: labelFontFamily,
        fontSize: labelFontSize
      }
    }
  }

  const labelOptionLines = {
    label: getLabelOption('lines', label, true, {
      formatter (param) {
        const { name, data } = param
        return `${name}(${data.value[2]})`
      }
    })
  }

  let metricOptions
  let visualMapOptions

  const dataTree = {}
  let min = 0
  let max = 0

  const agg = metrics[0].agg
  const metricName = decodeMetricName(metrics[0].name)

  data.forEach((record) => {
    let areaVal
    const group = []

    const value = record[`${agg}(${metricName})`]
    min = Math.min(min, value)
    max = Math.max(max, value)

    cols.forEach((col) => {
      const { visualType } = model[col]
      if (visualType === 'geoProvince') {
        areaVal = record[col]
        const area = getProvinceArea(areaVal)
        if (area) {
          if (!dataTree[areaVal]) {
            dataTree[areaVal] = {
              lon: area.lon,
              lat: area.lat,
              value,
              children: {}
            }
          }
        }
      } else if (visualType === 'geoCity') {
        areaVal = record[col]
        const area = getCityArea(areaVal)
        if (area) {
          if (layerType === 'map') {
            const provinceParent = getProvinceParent(area)
            const parentName = getProvinceName(provinceParent.name)
            if (!dataTree[parentName]) {
              dataTree[parentName] = {
                lon: area.lon,
                lat: area.lat,
                value: 0,
                children: {}
              }
            }
            dataTree[parentName].value += value
          } else {
            if (!dataTree[areaVal]) {
              dataTree[areaVal] = {
                lon: area.lon,
                lat: area.lat,
                value,
                children: {}
              }
            }
          }
        }
      }

      // todo: 除去显示城市／省的
      // const group = ['name', 'sex']
      // if (group.length) {
      //   group.forEach((g) => {
      //     if (!dataTree[areaVal].children[record[g]]) {
      //       dataTree[areaVal].children[record[g]] = 0
      //     }
      //     dataTree[areaVal].children[record[g]] = safeAddition(dataTree[areaVal].children[record[g]], Number(value))
      //   })
      // }
    })
  })

  // series 数据项
  const metricArr = []

  const sizeRate = getSizeRate(min, max)

  const optionsType = layerType === 'scatter' ? {} : {
    blurSize: 40
  }

  let serieObj
  if (layerType === 'map') {
    serieObj = {
      name: '地图',
      type: 'map',
      mapType: 'china',
      roam,
      data: Object.keys(dataTree).map((key, index) => {
        const { lon, lat, value } = dataTree[key]
        return {
          name: key,
          value: [lon, lat, value]
        }
      }),
      ...labelOption
    }
  } else if (layerType === 'scatter' || layerType === 'heatmap') {
    serieObj = {
      name: layerType === 'scatter' ? '气泡图' : '热力图',
      type: layerType || 'scatter',
      coordinateSystem: 'geo',
      data: Object.keys(dataTree).map((key, index) => {
        const { lon, lat, value } = dataTree[key]
        return {
          name: key,
          value: [lon, lat, value],
          symbolSize: getSymbolSize(sizeRate, value) / 2
        }
      }),
      ...labelOption,
      ...optionsType
    }
  }

  metricArr.push(serieObj)
  metricOptions = {
    series: metricArr
  }

  if (chartStyles.visualMap) {
    const {
      showVisualMap,
      visualMapPosition,
      fontFamily,
      fontSize,
      visualMapDirection,
      visualMapWidth,
      visualMapHeight,
      startColor,
      endColor
    } = chartStyles.visualMap

    visualMapOptions = {
      visualMap: {
        show: layerType === 'lines' ? false : showVisualMap,
        min,
        max,
        calculable: true,
        inRange: {
          color: [startColor, endColor]
        },
        ...getPosition(visualMapPosition),
        itemWidth: visualMapWidth,
        itemHeight: visualMapHeight,
        textStyle: {
          fontFamily,
          fontSize
        },
        orient: visualMapDirection
      }
    }
  } else {
    visualMapOptions = {
      visualMap: {
        show: false,
        min,
        max,
        calculable: true,
        inRange: {
          color: DEFAULT_ECHARTS_THEME.visualMapColor
        },
        left: 10,
        bottom: 20,
        itemWidth: 20,
        itemHeight: 50,
        textStyle: {
          fontFamily: 'PingFang SC',
          fontSize: 12
        },
        orient: 'vertical'
      }
    }
  }

  const tooltipOptions = {
    tooltip: {
      trigger: 'item'
      // formatter: (params) => {
      //   const treeNode = dataTree[params.name]
      //   let content = treeNode ? `${params.name}：${treeNode.value}` : ''

      //   const groupContent = Object.keys(treeNode.children).map((k) => `${k}：${treeNode.children[k]}<br/>`).join('')
      //   content += `<br/>${groupContent}`

      //   return content
      // }
    }
  }

  const getGeoCity = cols.filter((c) => model[c].visualType === 'geoCity')
  const getGeoProvince = cols.filter((c) => model[c].visualType === 'geoProvince')
  const linesSeries = []
  const legendData = []
  data.forEach((d, index) => {
    let linesSeriesData = []
    let scatterData = []
    const value = d[`${agg}(${metricName})`]

    if (d[getGeoCity[0]] && d[getGeoCity[1]]) {
      const fromCityInfo = getCityArea(d[getGeoCity[0]])
      const toCityInfo = getCityArea(d[getGeoCity[1]])
      legendData.push(d[getGeoCity[0]])
      linesSeriesData = [{
        fromName: d[getGeoCity[0]],
        toName: d[getGeoCity[1]],
        coords: [[fromCityInfo.lon, fromCityInfo.lat], [toCityInfo.lon, toCityInfo.lat]]
      }]
      scatterData = [{
        name: d[getGeoCity[1]],
        value: [toCityInfo.lon, toCityInfo.lat, value]
      }]
    } else if (d[getGeoProvince[0]] && d[getGeoProvince[1]]) {
      const fromProvinceInfo = getProvinceArea(d[getGeoProvince[0]])
      const toProvinceInfo = getProvinceArea(d[getGeoProvince[1]])
      legendData.push(d[getGeoProvince[0]])
      linesSeriesData = [{
        fromName: d[getGeoProvince[0]],
        toName: d[getGeoProvince[1]],
        coords: [[fromProvinceInfo.lon, fromProvinceInfo.lat], [toProvinceInfo.lon, toProvinceInfo.lat]]
      }]
      scatterData = [{
        name: d[getGeoProvince[1]],
        value: [toProvinceInfo.lon, toProvinceInfo.lat, value]
      }]
    } else {
      linesSeriesData = []
    }

    let effectScatterType
    effectScatterType = {
      name: d[getGeoCity[0]] || d[getGeoProvince[0]],
      type: 'effectScatter',
      coordinateSystem: 'geo',
      zlevel: index,
      rippleEffect: {
          brushType: 'stroke'
      },
      ...labelOptionLines,
      symbolSize: (val) => {
          return val[2] / 6
      },
      data: scatterData
    }

    linesSeries.push({
      name: d[getGeoCity[0]] || d[getGeoProvince[0]],
      type: 'lines',
      zlevel: index,
      symbol: ['none', 'arrow'],
      symbolSize: 10,
      effect: {
          show: true,
          period: 6,
          trailLength: 0,
          symbol: 'arrow',
          symbolSize: 15
      },
      lineStyle: {
          normal: {
              width: 2,
              opacity: 0.6,
              curveness: 0.2
          }
      },
      data: linesSeriesData
    },
    effectScatterType
  )
  })

  let legendOption
  if (chartStyles.legend) {
    const {
      color,
      fontFamily,
      fontSize,
      legendPosition,
      selectAll,
      showLegend
    } = chartStyles.legend
    legendOption = {
      legend: getLegendOption(chartStyles.legend, legendData)
    }
  } else {
    legendOption = null
  }

  let mapOptions
  switch (layerType) {
    case 'map':
      mapOptions = {
        ...metricOptions,
        ...visualMapOptions
      }
      break
    case 'lines':
      mapOptions = {
        ...legendOption,
        geo: {
          map: 'china',
          roam
        },
        series: linesSeries,
        ...visualMapOptions
      }
      break
    default:
      mapOptions = {
        geo: {
          map: 'china',
          itemStyle: {
            normal: {
              areaColor: '#0000003F',
              borderColor: '#FFFFFF',
              borderWidth: 1
            },
            emphasis: {
              areaColor: '#00000059'
            }
          },
          roam
        },
        ...metricOptions,
        ...visualMapOptions,
        ...tooltipOptions
      }
      break
  }

  return mapOptions
}

function getProvinceParent (area) {
  if (!area.parent) {
    return area
  }
  const parent = geoData.find((g) => g.id === area.parent)
  return !parent.parent ? parent : getProvinceParent(parent)
}

function getProvinceName (name) {
  provinceSuffix.forEach((ps) => {
    if (name.includes(ps)) {
      name = name.replace(ps, '')
    }
  })
  return name
}

function getCityArea (name) {
  const hasSuffix = citySuffix.some((p) => name.includes(p))
  const area = hasSuffix
    ? geoData.find((d) => d.name === name)
    : geoData.find((d) => d.name.includes(name))
  return area
}

function getProvinceArea (name) {
  const hasSuffix = provinceSuffix.some((p) => name.includes(p))
  const area = hasSuffix
    ? geoData.find((d) => d.name === name && !d.parent)
    : geoData.find((d) => d.name.includes(name) && !d.parent)
  return area
}

function getPosition (position) {
  let positionValue
  switch (position) {
    case 'leftBottom':
      positionValue = {
        left: 'left',
        top: 'bottom'
      }
      break
    case 'leftTop':
      positionValue = {
        left: 'left',
        top: 'top'
      }
      break
    case 'rightTop':
      positionValue = {
        left: 'right',
        top: 'top'
      }
      break
    case 'rightBottom':
      positionValue = {
        left: 'right',
        top: 'bottom'
      }
      break
  }
  return positionValue
}
