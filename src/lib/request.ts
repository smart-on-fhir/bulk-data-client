import got  from "got/dist/source"
import util from "util"
import { exit, print } from "./utils"
import prompt from "prompt-sync"
import "colors"


const debug = util.debuglog("app-request")


export default got.extend({
    hooks: {
        beforeRequest: [
            options => {
                options.headers["user-agent"] = "Bulk Data Client <https://github.com/smart-on-fhir/bulk-data-client>"
            }
        ],        
        afterResponse: [
            (response, retryWithMergedOptions) => {

                const { options } = response.request;

                const payload = options.body || options.form || options.json
                debug(
                    "\n=======================================================" +
                    "\n--------------------- Request -------------------------" +
                    "\n%s %s\n%o\n\n%o" +
                    "\n--------------------- Response ------------------------" +
                    "\n%s %s\n%o\n\n%o" +
                    "\n=======================================================",
                    options.method,
                    options.url,
                    options.headers,
                    payload ?? "",
                    response.statusCode,
                    response.statusMessage,
                    response.headers,
                    response.body ?? ""
                )

                // Handle transient errors by asking the user if (s)he wants to
                // retry. Note that this only happens if the "reporter" option
                // is "cli", which implies interactive capabilities. If the
                // reporter is "text", then there may be no way to render a
                // question prompt so transient errors should be handled 
                // downstream by the postprocessing components
                if (options.context?.interactive && response.body && typeof response.body == "object") {
                        
                    // @ts-ignore OperationOutcome errors
                    if (response.body.resourceType === "OperationOutcome") {
                        const oo = response.body as fhir4.OperationOutcome
                        if (oo.issue.every(i => i.code === 'transient')) {
                            let msg = oo.issue.map(i => i.details?.text || i.diagnostics).filter(Boolean);
                            print.commit()
                            console.log("The server replied with transient error(s)".red.bold)
                            if (msg) {
                                console.log("- " + msg.join("\n- "))
                            }
                            const answer = process.env.AUTO_RETRY_TRANSIENT_ERRORS || prompt()("Would you like to retry? [Y/n]".cyan);
                            if (!answer || answer.toLowerCase() === 'y') {
                                return retryWithMergedOptions(options);
                            } else {
                                exit("Cancelled by user")
                            }
                        }
                    }
                }

                return response
            }
        ],
        beforeError: [
            // @ts-ignore
            error => {
                const { response, options } = error;

                if (options.context?.ignoreErrors) {
                    return error; // Do not exit or print custom stuff
                }

                let title = "Failed to make a request"
                let message = error.message;

                const props: any = {
                    "request": options.method + " " + options.url,
                    "request headers": options.headers
                };


                if (response) {

                    title = "Received an error from the server"

                    props.response = [response.statusCode, response.statusMessage].join(" ")

                    props["response headers"] = response.headers

                    if (response?.body && typeof response?.body == "object") {
                        
                        // @ts-ignore OperationOutcome errors
                        if (response.body.resourceType === "OperationOutcome") {
                            const oo = response.body as fhir4.OperationOutcome
                            props.type = "OperationOutcome"
                            props.severity = oo.issue[0].severity
                            props.code = oo.issue[0].code
                            props.payload = oo
                            message = oo.issue[0].details?.text || oo.issue[0].diagnostics || "Unknown error"
                        }

                        // @ts-ignore OAuth errors
                        else if (response.body.error) {
                            props.type = "OAuth Error"
                            props.payload = response.body
                            // @ts-ignore
                            message = [response.body.error, response.body.error_description].filter(Boolean).join(": ")
                        }
                    }
                }

                print.commit()
                // @ts-ignore
                process.stdout.write(String(title + ": ").red.bold)
                exit(message.red, props)
            }
        ]
    }
})
