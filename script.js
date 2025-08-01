// The ES module import statements are crucial for this to work.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson@3/+esm";

/* This script creates a dynamic map of California wildfires.
    It includes features like filtering by fire cause, searching by name,
    a time slider, and interactive legends for fire duration and size.
*/

async function initializeFireMap() {
  const width = 1200;
  const height = 800;

  // --- HTML Elements ---
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem; position: relative;';
  
  const svg = d3.create('svg')
    .attr('viewBox', [0, 0, width, height])
    .style('border', '1px solid #ccc');
  
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position: absolute; background: white; border: 1px solid #ccc; padding: 8px; font-size: 12px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: none; pointer-events: none; max-width: 220px; z-index: 1;';
  
  const resetZoomBtn = document.createElement('button');
  resetZoomBtn.textContent = 'Reset Zoom';
  resetZoomBtn.style.fontSize = '12px';

  // --- D3 Groups for layering ---
  const zoomGroup = svg.append('g');
  const mapGroup = zoomGroup.append('g');
  const circlesGroup = zoomGroup.append('g');
  const pointerGroup = zoomGroup.append('g');
  const legendGroup = svg.append('g').attr('transform', `translate(${width - 140}, 20)`);

  // --- Data and Scales ---
  const fires = await d3.json('data/fires.json');

  const parsedFires = fires.map(d => {
    const parsed = {
      ...d,
      latitude: +d.latitude,
      longitude: +d.longitude,
      FIRE_SIZE: +d.FIRE_SIZE,
      FIRE_DURATION_DAYS: +d.FIRE_DURATION_DAYS,
      DISCOVERY_DATETIME: d.DISCOVERY_DATETIME ? new Date(d.DISCOVERY_DATETIME) : null,
      CONT_DATETIME: d.CONT_DATETIME ? new Date(d.CONT_DATETIME) : null,
    };
    if (isNaN(parsed.latitude) || isNaN(parsed.longitude) || !parsed.DISCOVERY_DATETIME) {
      return null;
    }
    return parsed;
  }).filter(d => d);

  const formatDate = d3.timeFormat('%B %d, %Y');
  const formatInputDate = d3.timeFormat('%Y-%m-%d');
  const dateExtent = d3.extent(parsedFires, d => d.DISCOVERY_DATETIME);
  const days = d3.timeDays(dateExtent[0], d3.timeDay.offset(dateExtent[1], 1));
  
  const colorScale = d3.scaleSequential()
    .domain([30, 0])
    .interpolator(d3.interpolateCividis);
  
  const sizeScale = d3.scaleSqrt()
    .domain([0, 1000000])
    .range([0, 30]);

  const projection = d3.geoAlbers()
    .rotate([120, 0])
    .center([0, 37.5])
    .parallels([29.5, 45.5])
    .scale(4000)
    .translate([width / 2, height / 2]);
  
  const path = d3.geoPath().projection(projection);

  // --- Map Drawing ---
  const us = await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
  const california = topojson.feature(us, us.objects.states)
    .features.find(d => d.id === '06');

  mapGroup.append('path')
    .datum(california)
    .attr('fill', '#f0f0f0')
    .attr('stroke', '#888')
    .attr('d', path)
    .lower();
  
  // --- Animation and Control Variables ---
  let interval = null;
  let isPlaying = false;
  let searchTargetFire = null;

  // --- UI Controls ---
  const label = document.createElement('div');
  label.style.cssText = 'font-weight: bold; font-size: 14px;';
  
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = days.length - 1;
  slider.step = '1';
  slider.value = '0';
  slider.style.flex = '1';

  const datePicker = document.createElement('input');
  datePicker.type = 'date';
  datePicker.value = formatInputDate(days[0]);
  datePicker.min = formatInputDate(days[0]);
  datePicker.max = formatInputDate(days[days.length - 1]);
  datePicker.style.fontSize = '12px';

  const playBtn = document.createElement('button');
  playBtn.textContent = '▶ Play';
  playBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';

  const speedControl = document.createElement('select');
  speedControl.style.fontSize = '12px';
  [1, 2, 3, 4, 5].forEach(x => {
    const option = document.createElement('option');
    option.value = x;
    option.textContent = `${x}x`;
    speedControl.appendChild(option);
  });
  
  const searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.placeholder = 'Search fire name...';
  searchBox.style.cssText = 'flex: 1; padding: 4px; font-size: 12px;';
  
  const searchBtn = document.createElement('button');
  searchBtn.textContent = 'Search';
  searchBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
  
  const clearBtn = document.createElement('button');
  clearBtn.textContent = '✕';
  clearBtn.style.cssText = 'padding: 4px 6px; font-size: 12px;';
  clearBtn.style.display = 'none';

  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; width: 100%;';
  searchContainer.append(searchBox, searchBtn, clearBtn);
  
  const dateControls = document.createElement('div');
  dateControls.style.cssText = 'display: flex; align-items: center; gap: 1rem;';
  dateControls.append(slider, datePicker, playBtn, document.createTextNode('Speed: '), speedControl);

  const causes = Array.from(new Set(parsedFires.map(d => d.NWCG_GENERAL_CAUSE))).sort();
  const selectAllBtn = document.createElement('button');
  selectAllBtn.type = 'button';
  selectAllBtn.textContent = 'Select None';
  selectAllBtn.style.fontSize = '12px';
  
  let allSelected = true;
  const causeCheckboxes = causes.map(cause => {
    const label = document.createElement('label');
    label.style.fontSize = '12px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'cause';
    input.value = cause;
    input.checked = true;
    label.append(input, document.createTextNode(` ${cause}`));
    return label;
  });

  const causeFilterForm = document.createElement('form');
  causeFilterForm.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;';
  const causeCheckboxesContainer = document.createElement('div');
  causeCheckboxesContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem;';
  causeCheckboxes.forEach(cb => causeCheckboxesContainer.appendChild(cb));
  causeFilterForm.append(selectAllBtn, causeCheckboxesContainer);

  // --- Append UI elements to container ---
  container.append(
    label,
    dateControls,
    document.createTextNode('Filter by Cause:'),
    causeFilterForm,
    document.createTextNode('Search by Fire Name:'),
    searchContainer,
    resetZoomBtn,
    svg.node(),
    tooltip
  );

  // --- Yearly Stats Table ---
  const yearlyStats = d3.rollups(
    parsedFires,
    v => ({
      avgDuration: d3.mean(v, d => d.FIRE_DURATION_DAYS),
      avgSize: d3.mean(v, d => d.FIRE_SIZE)
    }),
    d => d.DISCOVERY_DATETIME.getFullYear()
  )
  .sort((a, b) => d3.ascending(a[0], b[0]));
  
  const statsContainer = document.createElement('div');
  statsContainer.style.cssText = `
    position: absolute;
    bottom: 20px; /* Changed from top */
    right: 20px;
    width: 200px;
    background: white;
    border: 1px solid #ccc;
    padding: 8px;
    font-size: 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    z-index: 2;
  `;
  statsContainer.innerHTML = `
    <div><strong>Avg Duration & Size by Year</strong></div>
    <table style="border-collapse: collapse; margin-top: 4px; font-size: 11px;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 2px 6px; border-bottom: 1px solid #ccc;">Year</th>
          <th style="text-align: right; padding: 2px 6px; border-bottom: 1px solid #ccc;">Duration in Days</th>
          <th style="text-align: right; padding: 2px 6px; border-bottom: 1px solid #ccc;">Size in Acres</th>
        </tr>
      </thead>
      <tbody>
        ${yearlyStats.map(([year, stats]) => `
          <tr>
            <td style="padding: 2px 6px;">${year}</td>
            <td style="text-align: right; padding: 2px 6px;">${stats.avgDuration?.toFixed(1) || '–'}</td>
            <td style="text-align: right; padding: 2px 6px;">${Math.round(stats.avgSize).toLocaleString() || '–'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.appendChild(statsContainer);

  // --- Update Function (Core Logic) ---
  function update() {
    const selectedIndex = +slider.value;
    const selectedDate = days[selectedIndex];
    label.textContent = formatDate(selectedDate);
    datePicker.value = formatInputDate(selectedDate);

    const selectedCauses = Array.from(causeFilterForm.querySelectorAll('input:checked'))
      .map(input => input.value);
    
    const query = searchBox.value.trim().toLowerCase();
    
    let filteredFires = parsedFires.filter(d => 
      d.DISCOVERY_DATETIME <= selectedDate &&
      (!d.CONT_DATETIME || selectedDate < d.CONT_DATETIME) &&
      selectedCauses.includes(d.NWCG_GENERAL_CAUSE) &&
      (query === '' || (d.FIRE_NAME && d.FIRE_NAME.toLowerCase().includes(query)))
    );

    pointerGroup.selectAll('line').remove();
    pointerGroup.selectAll('defs').remove();
    
    if (searchTargetFire) {
      searchTargetFire.forEach(fire => {
        const [x, y] = projection([fire.longitude, fire.latitude]);
        if (x && y) {
          // Arrowhead marker definition
          const defs = pointerGroup.append('defs');
          defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 5)
            .attr('refY', 5)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto-start-reverse')
            .append('path')
            .attr('d', 'M 0 0 L 10 5 L 0 10 z')
            .attr('fill', 'black');
          
          pointerGroup.append('line')
            .datum(fire)
            .attr('x1', x)
            .attr('y1', y - 25)
            .attr('x2', x)
            .attr('y2', y - 5)
            .attr('stroke', 'black')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrowhead)')
            .style('cursor', 'pointer')
            .on('mouseenter', function(event, d) {
              const rect = container.getBoundingClientRect();
              tooltip.style.display = 'block';
              tooltip.style.left = `${event.clientX - rect.left + 10}px`;
              tooltip.style.top = `${event.clientY - rect.top + 10}px`;
              tooltip.innerHTML = `
                <strong>Fire Name:</strong> ${d.FIRE_NAME || '(Unnamed Fire)'}<br>
                <strong>Cause:</strong> ${d.NWCG_GENERAL_CAUSE || 'Unknown'}<br>
                <strong>County:</strong> ${d.COUNTY || 'Unknown'}<br>
                <b>Size:</b> ${d.FIRE_SIZE.toLocaleString()} acres<br>
                <b>Duration:</b> ${d.FIRE_DURATION_DAYS === 0 ? 'Unknown' : d.FIRE_DURATION_DAYS.toFixed(1) + ' days'}<br>
                <b>Discovered:</b> ${formatDate(d.DISCOVERY_DATETIME)}<br>
                <b>Contained:</b> ${d.CONT_DATETIME ? formatDate(d.CONT_DATETIME) : 'N/A'}`;
            })
            .on('mousemove', function(event) {
              const rect = container.getBoundingClientRect();
              tooltip.style.left = `${event.clientX - rect.left + 10}px`;
              tooltip.style.top = `${event.clientY - rect.top + 10}px`;
            })
            .on('mouseleave', function() {
              tooltip.style.display = 'none';
            });
        }
      });
    }

    circlesGroup.selectAll('circle')
      .data(filteredFires, d => d.FIRE_NAME + d.latitude + d.longitude + d.DISCOVERY_DATETIME)
      .join(
        enter => enter.append('circle')
          .attr('cx', d => projection([d.longitude, d.latitude])[0])
          .attr('cy', d => projection([d.longitude, d.latitude])[1])
          .attr('r', d => sizeScale(d.FIRE_SIZE))
          .attr('fill', d => colorScale(Math.min(d.FIRE_DURATION_DAYS, 30)))
          .attr('fill-opacity', 0.85)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.3)
          .style('cursor', 'pointer')
          .on('mouseenter', function(event, d) {
            const rect = container.getBoundingClientRect();
            tooltip.style.display = 'block';
            tooltip.style.left = `${event.clientX - rect.left + 10}px`;
            tooltip.style.top = `${event.clientY - rect.top + 10}px`;
            tooltip.innerHTML = `
              <strong>Fire Name:</strong> ${d.FIRE_NAME || '(Unnamed Fire)'}<br>
              <strong>Cause:</strong> ${d.NWCG_GENERAL_CAUSE || 'Unknown'}<br>
              <strong>County:</strong> ${d.COUNTY || 'Unknown'}<br>
              <b>Size:</b> ${d.FIRE_SIZE.toLocaleString()} acres<br>
              <b>Duration:</b> ${d.FIRE_DURATION_DAYS === 0 ? 'Unknown' : d.FIRE_DURATION_DAYS.toFixed(1) + ' days'}<br>
              <b>Discovered:</b> ${formatDate(d.DISCOVERY_DATETIME)}<br>
              <b>Contained:</b> ${d.CONT_DATETIME ? formatDate(d.CONT_DATETIME) : 'N/A'}`;
          })
          .on('mousemove', function(event) {
            const rect = container.getBoundingClientRect();
            tooltip.style.left = `${event.clientX - rect.left + 10}px`;
            tooltip.style.top = `${event.clientY - rect.top + 10}px`;
          })
          .on('mouseleave', function() {
            tooltip.style.display = 'none';
          }),
        update => update,
        exit => exit.remove()
      );
  }

  // --- Animation Controls ---
  function play() {
    const speedMultiplier = +speedControl.value;
    const max = +slider.max;
    isPlaying = true;
    playBtn.textContent = '⏸ Pause';
    interval = setInterval(() => {
      let current = +slider.value;
      let next = current + speedMultiplier;
      if (next > max) next = 0;
      slider.value = next.toString();
      update();
    }, 50 / speedMultiplier);
  }

  function pause() {
    clearInterval(interval);
    interval = null;
    isPlaying = false;
    playBtn.textContent = '▶ Play';
  }
  
  function handleSearch() {
    const query = searchBox.value.trim().toLowerCase();
    searchTargetFire = parsedFires.filter(d => d.FIRE_NAME && d.FIRE_NAME.toLowerCase() === query);
    update();
  }

  // --- Event Listeners ---
  slider.addEventListener('input', () => {
    update();
    if (interval) pause();
  });

  datePicker.addEventListener('change', () => {
    const pickedStr = datePicker.value;
    const index = days.findIndex(d => formatInputDate(d) === pickedStr);
    if (index >= 0) {
      slider.value = index.toString();
      update();
      if (interval) pause();
    }
  });

  causeFilterForm.addEventListener('change', update);

  selectAllBtn.addEventListener('click', () => {
    allSelected = !allSelected;
    causeCheckboxes.forEach(label => {
      label.querySelector('input').checked = allSelected;
    });
    selectAllBtn.textContent = allSelected ? 'Select None' : 'Select All';
    update();
  });

  playBtn.addEventListener('click', () => {
    if (interval) pause();
    else play();
  });

  speedControl.addEventListener('change', () => {
    if (interval) {
      pause();
      play();
    }
  });

  resetZoomBtn.onclick = () => {
    svg.transition().duration(500).call(d3.zoom().transform, d3.zoomIdentity);
  };
  
  searchBtn.addEventListener('click', handleSearch);
  searchBox.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  });
  searchBox.addEventListener('input', () => {
    clearBtn.style.display = searchBox.value ? 'inline-block' : 'none';
  });
  clearBtn.addEventListener('click', () => {
    searchBox.value = '';
    searchTargetFire = null;
    update();
    searchBox.focus();
    clearBtn.style.display = 'none';
  });

  // --- Zoom Behavior ---
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on('zoom', (event) => {
      zoomGroup.attr('transform', event.transform);
    });
  svg.call(zoom);

  // --- Legends ---
  const durationLegendHeight = 150;
  const durationLegendWidth = 15;

  const defs = svg.append('defs');
  const gradientId = 'duration-gradient';

  const gradient = defs.append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0%')
    .attr('y1', '100%')
    .attr('x2', '0%')
    .attr('y2', '0%');

  const legendDomain = colorScale.domain();
  const nStops = 10;
  d3.range(nStops + 1).forEach(i => {
    const t = i / nStops;
    gradient.append('stop')
      .attr('offset', `${t * 100}%`)
      .attr('stop-color', colorScale(legendDomain[0] + t * (legendDomain[1] - legendDomain[0])));
  });

  const durationLegend = legendGroup.append('g').attr('class', 'duration-legend');

  durationLegend.append('text')
    .attr('x', 0)
    .attr('y', -6)
    .style('font-size', '12px')
    .text('Fire Duration');

  durationLegend.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', durationLegendWidth)
    .attr('height', durationLegendHeight)
    .style('fill', `url(#${gradientId})`);

  const durationScale = d3.scaleLinear()
    .domain(legendDomain)
    .range([durationLegendHeight, 0]);

  const durationAxis = d3.axisRight(durationScale)
    .ticks(5)
    .tickFormat(d => `${d}d`);

  durationLegend.append('g')
    .attr('transform', `translate(${durationLegendWidth}, 0)`)
    .call(durationAxis);

  // THIS IS THE CORRECTED CODE FOR THE FIRE SIZE LEGEND
  const sizeLegend = legendGroup.append('g')
    .attr('transform', `translate(0, ${durationLegendHeight + 40})`);

  sizeLegend.append('text')
    .attr('x', 0)
    .attr('y', 0)
    .style('font-size', '12px')
    .text('Fire Size');

  const fireSizes = [1000, 10000, 100000, 500000];
  const verticalSpacing = 40;
  const horizontalOffset = 30;

  const sizeLegendItems = sizeLegend.selectAll('g.size-item')
    .data(fireSizes)
    .enter()
    .append('g')
    .attr('class', 'size-item')
    .attr('transform', (d, i) => `translate(0, ${i * verticalSpacing + 20})`); // Offset the group for each item

  sizeLegendItems.append('circle')
    .attr('cx', horizontalOffset)
    .attr('cy', 0)
    .attr('r', d => sizeScale(d))
    .attr('fill', 'none')
    .attr('stroke', '#333');

  sizeLegendItems.append('text')
    .attr('x', horizontalOffset + sizeScale(fireSizes[fireSizes.length-1]) + 10)
    .attr('y', 0)
    .attr('alignment-baseline', 'middle')
    .style('font-size', '11px')
    .text(d => `${d.toLocaleString()} acres`);

  // END OF CORRECTED CODE FOR FIRE SIZE LEGEND

  // Initial render
  update();
  
  return container;
}

// Attach the visualization to the 'vis' div when the document is ready.
document.addEventListener('DOMContentLoaded', async () => {
    const visContainer = document.getElementById('vis');
    const mapContainer = await initializeFireMap();
    if (visContainer && mapContainer) {
        visContainer.appendChild(mapContainer);
    }
});