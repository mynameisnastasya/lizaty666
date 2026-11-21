import React from "react";
import {createRoot} from "react-dom/client";
import AstrodayDesign from "./astroday-design";
const element=document.getElementById("root");
if(!element) throw new Error("ASTRODAY root missing");
createRoot(element).render(<React.StrictMode><AstrodayDesign/></React.StrictMode>);
