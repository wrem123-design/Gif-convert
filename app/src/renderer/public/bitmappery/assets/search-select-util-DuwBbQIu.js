const n=r=>r.map(t=>typeof t=="object"?t:{label:o(t.toString()),value:t}),o=r=>r.toLowerCase().split(" ").map(t=>t.charAt(0).toUpperCase()+t.substring(1)).join(" ");export{n as m};
