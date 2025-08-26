import { Application } from "express";
import ExampleRoutes from "./example.routes"

const useRoutes = (app: Application) => {
	app.use("/", ExampleRoutes);
}

export default useRoutes;