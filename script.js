import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson@3/+esm";


const width = 700,
 height = 900;
 const container = document.getElementById("vis");
const main = document.createElement("div");
main.style.display = "flex";
main.style.flexDirection = "column";
main.style.gap = "0.75rem";
main.style.position = "relative";
container.appendChild(main);


const svg = d3
 .create("svg")
 .attr("viewBox", [0, 0, width, height])
 .style("border", "1px solid #ccc");


const label = document.createElement("div");
label.style.fontWeight = "bold";
label.style.fontSize = "14px";
main.appendChild(label);


// UI placeholders
const slider = document.createElement("input");
slider.type = "range";
slider.style.flex = 1;


const datePicker = document.createElement("input");
datePicker.type = "date";
datePicker.style.fontSize = "12px";


const playBtn = document.createElement("button");
playBtn.textContent = "▶ Play";
playBtn.style.padding = "4px 8px";
playBtn.style.fontSize = "12px";


const searchBox = document.createElement("input");
searchBox.type = "text";
searchBox.placeholder = "Search fire name...";
searchBox.style.width = "100%";
searchBox.style.padding = "4px";
searchBox.style.fontSize = "12px";


const dateControls = document.createElement("div");
dateControls.style.display = "flex";
dateControls.style.alignItems = "center";
dateControls.style.gap = "1rem";
dateControls.append(slider, datePicker, playBtn);


main.appendChild(dateControls);
main.appendChild(document.createTextNode("Filter by Cause:"));


const causeFilter = document.createElement("form");
causeFilter.style.display = "flex";
causeFilter.style.flexWrap = "wrap";
causeFilter.style.gap = "0.5rem";
main.appendChild(causeFilter);


main.appendChild(document.createTextNode("Search by Fire Name:"));
main.appendChild(searchBox);
main.appendChild(svg.node());


const tooltip = document.createElement("div");
Object.assign(tooltip.style, {
 position: "absolute",
 background: "white",
 border: "1px solid #ccc",
 padding: "8px",
 fontSize: "12px",
 borderRadius: "4px",
 boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
 display: "none",
 pointerEvents: "none",
 maxWidth: "220px",
 zIndex: 1
});
main.appendChild(tooltip);


let fires = [];
let days = [];
let interval = null;
let projection, path, durationScale, sizeScale;


(async function init() {
 fires = await d3.json("data/fires.json");
 const formatDate = d3.timeFormat("%B %d, %Y");
 const formatInputDate = d3.timeFormat("%Y-%m-%d");


 const dateExtent = d3.extent(fires, (d) => new Date(d.DISCOVERY_DATETIME));
 days = d3.timeDays(dateExtent[0], d3.timeDay.offset(dateExtent[1], 1));
 const dayTimestamps = days.map((d) => +d);


 slider.min = 0;
 slider.max = days.length - 1;
 slider.step = 1;
 slider.value = 0;


 datePicker.min = formatInputDate(days[0]);
 datePicker.max = formatInputDate(days[days.length - 1]);
 datePicker.value = formatInputDate(days[0]);


 const causes = Array.from(new Set(fires.map((d) => d.NWCG_GENERAL_CAUSE))).sort();
 causes.forEach((cause) => {
   const label = document.createElement("label");
   label.style.fontSize = "12px";
   const input = document.createElement("input");
   input.type = "checkbox";
   input.name = "cause";
   input.value = cause;
   input.checked = true;
   label.append(input, ` ${cause}`);
   causeFilter.appendChild(label);
 });


 const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
 const california = topojson
   .feature(us, us.objects.states)
   .features.find((d) => d.id === "06");


 projection = d3
   .geoAlbers()
   .rotate([120, 0])
   .center([0, 37.5])
   .parallels([29.5, 45.5])
   .scale(4000)
   .translate([width / 2, height / 2]);


 path = d3.geoPath().projection(projection);


 svg
   .append("path")
   .datum(california)
   .attr("fill", "#f0f0f0")
   .attr("stroke", "#888")
   .attr("d", path)
   .lower();


 const circlesGroup = svg.append("g");
 const colorScale = d3.scaleSequential().domain([0, 30]).interpolator(d3.interpolateYlOrRd);
 durationScale = d3.scaleLinear().domain([0, 30]).range([20, 280]);
 sizeScale = d3.scaleSqrt().domain([0, 1000000]).range([0, 30]);


 function update() {
   const selectedIndex = +slider.value;
   const selectedDate = new Date(dayTimestamps[selectedIndex]);
   label.textContent = formatDate(selectedDate);
   datePicker.value = formatInputDate(selectedDate);


   const selectedCauses = Array.from(
     causeFilter.querySelectorAll("input:checked")
   ).map((input) => input.value);
   const query = searchBox.value.trim().toLowerCase();


   const fireData = fires
     .map((d) => ({
       name: d.FIRE_NAME,
       lat: +d.latitude,
       lon: +d.longitude,
       size: +d.FIRE_SIZE,
       discovered: new Date(d.DISCOVERY_DATETIME),
       contained: d.CONT_DATETIME ? new Date(d.CONT_DATETIME) : null,
       duration: +d.FIRE_DURATION_DAYS,
       cause: d.NWCG_GENERAL_CAUSE
     }))
     .filter(
       (d) =>
         d.discovered <= selectedDate &&
         (!d.contained || selectedDate < d.contained) &&
         selectedCauses.includes(d.cause) &&
         !isNaN(d.lat) &&
         !isNaN(d.lon) &&
         !isNaN(d.size) &&
         !isNaN(d.duration) &&
        //  (query === "" || d.name.toLowerCase().includes(query))
        (query === "" || (d.name && d.name.toLowerCase().includes(query)))
     );


   tooltip.style.display = "none";


   circlesGroup
     .selectAll("circle")
     .data(fireData, (d) => d.name + d.lat + d.lon)
     .join(
       (enter) =>
         enter
           .append("circle")
           .attr("cx", (d) => projection([d.lon, d.lat])[0])
           .attr("cy", (d) => projection([d.lon, d.lat])[1])
           .attr("r", (d) => sizeScale(d.size))
           .attr("fill", (d) => colorScale(Math.min(d.duration, 30)))
           .attr("fill-opacity", 0.85)
           .attr("stroke", "#333")
           .attr("stroke-width", 0.3)
           .style("cursor", "pointer")
           .on("click", function (event, d) {
             const rect = container.getBoundingClientRect();
             tooltip.style.display = "block";
             tooltip.style.left = `${event.clientX - rect.left + 10}px`;
             tooltip.style.top = `${event.clientY - rect.top + 10}px`;
             tooltip.innerHTML = `
               <strong>${d.name || "(Unnamed Fire)"}</strong><br>
               <b>Size:</b> ${d.size.toLocaleString()} acres<br>
               <b>Duration:</b> ${
                 d.duration === 0.0 ? "Unknown" : d.duration.toFixed(1) + " days"
               }<br>
               <b>Discovered:</b> ${formatDate(d.discovered)}<br>
               <b>Contained:</b> ${d.contained ? formatDate(d.contained) : "N/A"}
             `;
             event.stopPropagation();
           }),
       (update) => update,
       (exit) => exit.remove()
     );
 }


 function play() {
   playBtn.textContent = "⏸ Pause";
   interval = setInterval(() => {
     let next = +slider.value + 1;
     if (next > +slider.max) {
       clearInterval(interval);
       playBtn.textContent = "▶ Play";
       return;
     }
     slider.value = next;
     update();
   }, 300);
 }


 function pause() {
   clearInterval(interval);
   playBtn.textContent = "▶ Play";
 }

////
// Legend dimensions and positions
const legendWidth = 260;
const legendHeight = 12;
const legendX = 40;
const legendY = 30;

// Add defs and linearGradient for color legend
const defs = svg.append("defs");
const linearGradient = defs.append("linearGradient")
  .attr("id", "color-gradient")
  .attr("x1", "0%")
  .attr("x2", "100%");

for (let i = 0; i <= 100; i++) {
  linearGradient.append("stop")
    .attr("offset", `${i}%`)
    .attr("stop-color", d3.interpolateYlOrRd(i / 100));
}

// Add label for color legend
svg.append("text")
  .attr("x", legendX)
  .attr("y", legendY - 10)
  .attr("font-size", "12px")
  .attr("font-weight", "bold")
  .text("Fire Duration (days)");

// Add color gradient rect
svg.append("rect")
  .attr("x", legendX)
  .attr("y", legendY)
  .attr("width", legendWidth)
  .attr("height", legendHeight)
  .style("fill", "url(#color-gradient)")
  .attr("stroke", "#ccc");

// Create a separate scale for the legend axis (pixels)
const legendScale = d3.scaleLinear()
  .domain([0, 30])
  .range([legendX, legendX + legendWidth]);

// Add axis below the gradient
svg.append("g")
  .attr("transform", `translate(0, ${legendY + legendHeight})`)
  .call(d3.axisBottom(legendScale)
    .tickValues([0, 5, 10, 15, 20, 25, 30])
    .tickFormat(d => `${d} days`)
  )
  .selectAll("text")
  .style("font-size", "10px");

// Fire Size Legend
const sizeLegendX = width - 130;
const sizeLegendY = 50;

const sizeLegend = svg.append("g")
  .attr("transform", `translate(${sizeLegendX}, ${sizeLegendY})`);

const sizeLegendValues = [10000, 100000, 500000];

sizeLegendValues.forEach((size, i) => {
  const y = i * 40;
  sizeLegend.append("circle")
    .attr("cx", 0)
    .attr("cy", y)
    .attr("r", sizeScale(size))
    .attr("fill", "none")
    .attr("stroke", "#555");

  sizeLegend.append("text")
    .attr("x", 40)
    .attr("y", y)
    .attr("alignment-baseline", "middle")
    .attr("font-size", "11px")
    .text(`${(size / 1000).toLocaleString()}k acres`);
});

sizeLegend.append("text")
  .attr("x", 0)
  .attr("y", -10)
  .attr("font-size", "12px")
  .attr("font-weight", "bold")
  .text("Fire Size");
////


 svg.on("click", () => (tooltip.style.display = "none"));
 slider.addEventListener("input", update);
 datePicker.addEventListener("change", () => {
   const index = days.findIndex(
     (d) => formatInputDate(d) === datePicker.value
   );
   if (index >= 0) {
     slider.value = index;
     update();
   }
 });
 causeFilter.addEventListener("change", update);
//  searchBox.addEventListener("input", update);
searchBox.addEventListener("input", (e) => {
  console.log("Search changed:", e.target.value);
  update();
});
 playBtn.addEventListener("click", () => {
   if (interval) pause();
   else play();
 });


 update();
})();
