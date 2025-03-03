import { Application } from "express";
import ExampleRoutes from "./example.routes"

export default class Routes {
    constructor(app: Application) {
        app.use("/", ExampleRoutes);
    }
}