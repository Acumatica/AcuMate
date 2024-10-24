import { IAcuMateApiClient } from "./api/acu-mate-api-client";
import { ConfigurationService } from "./services/configuration-service";

export class AcuMateContext {
    public static ApiService: IAcuMateApiClient;
	public static ConfigurationService: ConfigurationService;
}