import { Component, OnInit, OnDestroy, Inject, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import { Subscription } from 'rxjs';

import { HmiService } from '../../_services/hmi.service';
import { TranslateService } from '@ngx-translate/core';
import { Utils } from '../../_helpers/utils';
import { Tag, TAG_PREFIX } from '../../_models/device';

@Component({
    selector: 'app-hub-property',
    templateUrl: './hub-property.component.html',
    styleUrls: ['./hub-property.component.css']
})
export class HubPropertyComponent implements OnInit, OnDestroy {

    @ViewChild('grptabs', {static: true}) grptabs: MatTabGroup;
    @ViewChild('tabsub', {static: true}) tabsub: MatTab;
    @ViewChild('tabpub', {static: true}) tabpub: MatTab;

    private listenOnSignalR: Subscription;

    editMode = false;
    hubSource = '#';
    hubsList = {};
    hubContent = [];
    hubSelectedSubType = 'raw';
    discoveryError = '';
    discoveryWait = false;
    discoveryTimer = null;
    selectedhub = { name: '', key: '', value: null, subs: null };
    hubToAdd = {};
    itemType:SignalRPayloadItemType;
    listen = null;
    invoke = null;
    serverAddress:string;
    invokeHubMethod: string;
    delegateHubMethod: string;
    invokeHubArgs:Array<object>;
    invokeArgs = new SignalRPayload();
    payloadResult = '';

    constructor(
        private hmiService: HmiService,
        private translateService: TranslateService,
        public dialogRef: MatDialogRef<HubPropertyComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any) {
    }

    ngOnInit() {
        console.log("ngOnInit data");
        console.log(this.data);
        this.serverAddress = this.data.device.property.address;
        this.listenOnSignalR = this.hmiService.onDeviceSignalRRequest.subscribe(value => {
        });

        Object.keys(this.itemType).forEach(key => {
            this.translateService.get(this.itemType[key]).subscribe((txt: string) => { this.itemType[key] = txt; });
        });

        // check if edit the hub
        if (this.data.hub) {
            let tag = <Tag>this.data.hub;
            if (tag.options) {
                if (tag.options.subs) {
                    // sure a subscription
                    this.grptabs.selectedIndex = 0;
                    this.tabpub.disabled = true;
                    this.hubSelectedSubType = tag.type;
                    this.editMode = true;
                    this.selecthub({ name: tag.name, key: tag.address, value: { content: tag.value }, subs: tag.options.subs });
                } else {
                    // publish hub
                    this.grptabs.selectedIndex = 1;
                    this.tabsub.disabled = true;
                    this.serverAddress = tag.address;
                    this.invokeHubMethod = tag.name;
                    if (tag.options.pubs) {
                        // sure publish
                        this.invokeArgs.arguments = tag.options.pubs;
                    }
                }
            }
        }
        this.loadSelectedSubhub();
    }

    ngOnDestroy() {
        // this.checkToSave();
        try {
            if (this.listenOnSignalR) {
                this.listenOnSignalR.unsubscribe();
            }
        } catch (e) {
        }
    }

    //#region Subscription
    onNoClick(): void {
        this.dialogRef.close();
    }

    onDiscoveryhubs(source) {
        this.discoveryError = '';
        this.discoveryWait = true;
		this.discoveryTimer = setTimeout(() => {
            this.discoveryWait = false;
		}, 10000);
        this.hmiService.askDeviceBrowse(this.data.device.id, source);
    }

    onClearDiscovery() {
        this.hubsList = {};
        this.discoveryError = '';
        this.discoveryWait = false;
        try {
            if (this.discoveryTimer) {
			    clearInterval(this.discoveryTimer);
            }
		} catch { }
    }

    selecthub(hub) {
        this.selectedhub = hub;
        this.loadSelectedSubhub();
    }

    private loadSelectedSubhub() {
        this.hubContent =  [];
        if (this.hubSelectedSubType === 'json') {
            let obj = JSON.parse(this.selectedhub.value.content);
            Object.keys(obj).forEach(key => {
                let checked = (this.selectedhub.subs) ? false : true;
                if (this.selectedhub.subs && this.selectedhub.subs.indexOf(key) !== -1) {
                    checked = true;
                }
                this.hubContent.push({ key: key, value: obj[key], checked: checked, type: this.hubSelectedSubType });
            });
        } else if (this.selectedhub.value && this.selectedhub.value.content) {
            this.hubContent =  [{ name: this.selectedhub.name, key: this.selectedhub.key, value: this.selectedhub.value.content, checked: true, type: this.hubSelectedSubType }];
        }
    }

    onSubhubValChange(hubSelType) {
        this.loadSelectedSubhub();
    }

    ishubSelected(hub) {
        return (this.selectedhub === hub.key) ? true : false;
    }

    isSubscriptionEdit() {
        return this.editMode;
    }

    isSubscriptionValid() {
        if (this.hubContent && this.hubContent.length) {
            let onechecked = false;
            for (let i = 0; i < this.hubContent.length; i++) {
                if (this.hubContent[i].checked) {
                    onechecked = true;
                }
            }
            return onechecked;
        }
        return false;
    }

    onAddToSubscribe() {
        if (this.hubContent && this.hubContent.length && this.listen) {
            let hubsToAdd = [];
            for (let i = 0; i < this.hubContent.length; i++) {
                if (this.hubContent[i].checked) {
                    let hub = new Tag(Utils.getGUID(TAG_PREFIX));
                    if (this.data.hub) {
                        hub = new Tag(this.data.hub.id);
                    }
                    hub.type = this.hubSelectedSubType;
                    hub.address = this.selectedhub.key;
                    hub.memaddress = this.hubContent[i].key;
                    hub.options = { subs: this.hubContent.map((tcnt) => tcnt.key) };
                    if (this.hubContent[i].name) {
                        hub.name = this.hubContent[i].name;
                    } else {
                        hub.name = this.selectedhub.key;
                        if (hub.type === 'json') {
                            hub.name += '[' + hub.memaddress + ']';
                        }
                    }
                    hubsToAdd.push(hub);
                }
            }
            this.listen(this.data.hub, hubsToAdd);
        }
    }
    //#endregion

    //#region  Publish
    isPublishTypeToEnable(type: string) {
        if (type === 'raw' || (this.invokeArgs.arguments && this.invokeArgs.arguments.length)) {
            return true;
        }
        return false;
    }

    onTriggerInvoke() {
        this.invoke(this.data.hub);
    }

    onPubhubValChange(hubSelType) {
        this.stringifyInvokeArgument();
    }

    onAddInvokeArg() {
        this.invokeArgs.arguments.push(new SignalRPayloadItem());
        this.stringifyInvokeArgument();
    }

    onRemoveInvokeArg(index: number) {
        this.invokeArgs.arguments.splice(index, 1);
        this.stringifyInvokeArgument();
    }

    onSetPublishItemTag(item: SignalRPayloadItem, event: any) {
        item.value = event.variableId;
        if (event.variableRaw) {
            item.value = event.variableRaw.address;
        }
        this.stringifyInvokeArgument();
    }

    onItemTypeChanged(item: SignalRPayloadItem) {
        this.stringifyInvokeArgument();
    }

    /**
     * Render the payload content
     */
    stringifyInvokeArgument() {
        if (this.invokeArgs.arguments.length) {
            for (let i = 0; i < this.invokeArgs.arguments.length; i++) {
                let item: SignalRPayloadItem = this.invokeArgs.arguments[i];
                if (item.type === SignalRPayloadItemType.string) {
                    item.value = new String(item.value);
                } else if (item.type === SignalRPayloadItemType.object) {
                    item.value = JSON.parse(item.value.toString());
                }
            }
        } 
    }

    isInvokeInvalid() {
        return (this.invokeHubMethod) && typeof(JSON.parse(this.invokeHubMethod[0])) == "string";
    }
    //#endregion
}

export class SignalRPayload {
    arguments: SignalRPayloadItem[] = [];
}

export class SignalRPayloadItem{
    value : object;
    type : SignalRPayloadItemType;
}

export enum SignalRPayloadItemType{
    object = 'device.hub-type-object',
    string = 'device.hub-type-string',
}